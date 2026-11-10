import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import {
  chargeItems,
  expenses,
  houseMembers,
  houses,
  memberChargeQty,
  periodItems,
  periodMembers,
  periodUtilities,
  periods,
  user,
  utilityTariffs,
} from '@/db/schema'
import { computePeriod } from '@/lib/billing/compute'
import { daysInMonth, dueDateFor } from '@/lib/billing/period-month'
import type { ExpenseInput, FixedItem, PeriodInput, PeriodMember, PeriodResult, Tariff, UtilityInput, YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { MAX_MONEY } from '@/lib/validation'
import type { Actor } from './actor'
import { DEFAULT_TARIFF, isUniqueViolation, requireMember, requireOwner, type Tx } from './houses'
import { onPeriodClosed, onPeriodUpdated } from './period-events'

// Bản chụp: mỗi tháng có bản sao riêng của khoản cố định (period_items), bảng giá điện nước (period_utilities)
// và thành viên (period_members). Mọi phép tính của một tháng chỉ đọc bản chụp này, không đọc cấu hình nhà.
// Tháng NHÁP được `syncDraftPeriods` chép lại cấu hình sau mỗi lần sửa cài đặt; tháng ĐÃ CHỐT thì không bao giờ.
//
// Thứ tự khóa (tránh deadlock): dòng nhà (FOR NO KEY UPDATE) trước, rồi các dòng tháng (FOR NO KEY UPDATE)
// theo thứ tự tháng tăng dần. Khóa "NO KEY UPDATE" không chặn khóa KEY SHARE mà khóa ngoại của các lệnh INSERT
// (khoản chi, thành viên tháng) cần, nên một lệnh sửa tháng đang giữ dòng tháng vẫn chèn được dòng tham chiếu nhà.

export type Utility = 'electricity' | 'water'
const UTILITIES: Utility[] = ['electricity', 'water']
const UTILITY_LABEL: Record<Utility, string> = { electricity: 'Điện', water: 'Nước' }
/** Cột chỉ số là integer (int4); 9 chữ số là quá đủ cho công tơ điện, nước. */
const READING_MAX = 999_999_999

type PeriodRow = typeof periods.$inferSelect

export type UtilityView = { mode: 'tiered' | 'total'; prev: number | null; curr: number | null; total: number | null; tariff: Tariff | null }

export type PeriodView = {
  period: {
    id: string
    houseId: string
    year: number
    month: number
    status: 'draft' | 'closed'
    dueDate: string
    closedAt: Date | null
    revision: number
  }
  /** Tháng đã chốt: kết quả đã lưu. Tháng nháp: tính từ bản chụp hiện tại. */
  result: PeriodResult
  /** Đã sắp theo thứ tự thành viên (sortOrder). */
  members: PeriodMember[]
  items: FixedItem[]
  utilities: Record<Utility, UtilityView>
  expenses: ExpenseInput[]
}

export type PeriodListItem = { id: string; year: number; month: number; status: 'draft' | 'closed'; grandTotal: number | null }

const periodNotFound = () => new AppError('NOT_FOUND', 'PERIOD_NOT_FOUND', 'Không tìm thấy tháng này')
const periodClosed = (ym: YM) => new AppError('CONFLICT', 'PERIOD_CLOSED', `Tháng ${ym.month}/${ym.year} đã chốt sổ`)
const ymOf = (p: { year: number; month: number }): YM => ({ year: p.year, month: p.month })

function shiftMonth(ym: YM, delta: 1 | -1): YM {
  const index = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

async function findPeriod(db: Db, periodId: string): Promise<PeriodRow> {
  const [row] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1)
  if (!row) throw periodNotFound()
  return row
}

async function lockPeriod(tx: Tx, periodId: string): Promise<PeriodRow> {
  const [row] = await tx.select().from(periods).where(eq(periods.id, periodId)).for('no key update').limit(1)
  if (!row) throw periodNotFound()
  return row
}

async function findByYm(db: Db, houseId: string, ym: YM): Promise<PeriodRow | undefined> {
  const [row] = await db
    .select()
    .from(periods)
    .where(and(eq(periods.houseId, houseId), eq(periods.year, ym.year), eq(periods.month, ym.month)))
    .limit(1)
  return row
}

// ───────────────────────── Chép cấu hình nhà vào bản chụp ─────────────────────────

type HouseConfig = {
  houseId: string
  dueDay: number
  /** Khoản đang dùng, theo thứ tự trong cài đặt. */
  items: { id: string; name: string; kind: 'equal' | 'per_unit'; amount: number; sortOrder: number }[]
  tariffs: Map<Utility, { mode: 'tiered' | 'total'; tariff: Tariff }>
  /** Mọi thành viên từng ở nhà (kể cả đã rời: họ vẫn có thể nằm trong tháng nháp). */
  members: Map<string, { name: string; role: 'owner' | 'member'; sortOrder: number; active: boolean }>
  /** memberId → (chargeItemId → số lượng). */
  qty: Map<string, Map<string, number>>
}

/** Đọc cấu hình nhà dưới khóa dòng nhà, để việc tạo tháng, thêm thành viên và đồng bộ cài đặt chạy tuần tự. */
async function lockHouseConfig(tx: Tx, houseId: string): Promise<HouseConfig> {
  const [house] = await tx.select({ dueDay: houses.dueDay }).from(houses).where(eq(houses.id, houseId)).for('no key update').limit(1)
  if (!house) throw new AppError('NOT_FOUND', 'HOUSE_NOT_FOUND', 'Không tìm thấy nhà')
  const items = await tx
    .select({ id: chargeItems.id, name: chargeItems.name, kind: chargeItems.kind, amount: chargeItems.amount, sortOrder: chargeItems.sortOrder })
    .from(chargeItems)
    .where(and(eq(chargeItems.houseId, houseId), eq(chargeItems.active, true)))
    .orderBy(asc(chargeItems.sortOrder), asc(chargeItems.id))
  const tariffRows = await tx.select().from(utilityTariffs).where(eq(utilityTariffs.houseId, houseId))
  const memberRows = await tx
    .select({ id: houseMembers.id, name: user.name, role: houseMembers.role, sortOrder: houseMembers.sortOrder, leftAt: houseMembers.leftAt })
    .from(houseMembers)
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(eq(houseMembers.houseId, houseId))
    .orderBy(asc(houseMembers.sortOrder), asc(houseMembers.joinedAt))
  const qtyRows = await tx
    .select({ memberId: memberChargeQty.memberId, itemId: memberChargeQty.itemId, qty: memberChargeQty.qty })
    .from(memberChargeQty)
    .innerJoin(chargeItems, eq(chargeItems.id, memberChargeQty.itemId))
    .where(eq(chargeItems.houseId, houseId))
  const qty = new Map<string, Map<string, number>>()
  for (const r of qtyRows) {
    if (!qty.has(r.memberId)) qty.set(r.memberId, new Map())
    qty.get(r.memberId)!.set(r.itemId, r.qty)
  }
  return {
    houseId,
    dueDay: house.dueDay,
    items,
    tariffs: new Map(tariffRows.map((r) => [r.utility, { mode: r.mode, tariff: r.tariff }])),
    members: new Map(memberRows.map((m) => [m.id, { name: m.name, role: m.role, sortOrder: m.sortOrder, active: m.leftAt === null }])),
    qty,
  }
}

/** Chỉ số cuối của tháng liền trước (nếu tháng đó có trong sổ), dùng làm chỉ số đầu của tháng mới. */
async function previousCurr(tx: Tx, houseId: string, ym: YM, utility: Utility): Promise<number | null> {
  const before = await findByYm(tx, houseId, shiftMonth(ym, -1))
  if (!before) return null
  const [row] = await tx
    .select({ curr: periodUtilities.curr })
    .from(periodUtilities)
    .where(and(eq(periodUtilities.periodId, before.id), eq(periodUtilities.utility, utility)))
    .limit(1)
  return row?.curr ?? null
}

/**
 * Chép cấu hình nhà vào bản chụp của một tháng NHÁP (người gọi đã khóa dòng tháng và biết nó là nháp).
 * Ghi đè phần cấu hình (tên, cách chia, số tiền, thứ tự khoản; chế độ và bảng giá điện nước; tên, thứ tự,
 * số lượng theo người của thành viên; hạn đóng), giữ nguyên số liệu đã nhập (chỉ số, tổng tiền, ngày ở,
 * "tính tháng này", công tắc từng khoản). Khoản đã gỡ khỏi cài đặt bị bỏ khỏi tháng, khoản mới được thêm (đang bật),
 * thành viên đang ở mà chưa có trong tháng được thêm với đủ số ngày. Thành viên đã rời vẫn ở lại cho chủ nhà tự quyết.
 */
async function applyConfig(tx: Tx, cfg: HouseConfig, period: { id: string; year: number; month: number }): Promise<void> {
  const ym = ymOf(period)
  await tx.update(periods).set({ dueDate: dueDateFor(ym, cfg.dueDay) }).where(eq(periods.id, period.id))

  // khoản cố định, khớp theo sourceItemId
  const pending = new Map(cfg.items.map((i) => [i.id, i]))
  const perUnit: { periodItemId: string; sourceItemId: string }[] = []
  const existing = await tx.select().from(periodItems).where(eq(periodItems.periodId, period.id))
  for (const row of existing) {
    if (row.sourceItemId === null) continue
    const src = pending.get(row.sourceItemId)
    if (!src) {
      await tx.delete(periodItems).where(eq(periodItems.id, row.id))
      continue
    }
    pending.delete(src.id)
    await tx
      .update(periodItems)
      .set({ name: src.name, kind: src.kind, amount: src.amount, sortOrder: src.sortOrder })
      .where(eq(periodItems.id, row.id))
    if (src.kind === 'per_unit') perUnit.push({ periodItemId: row.id, sourceItemId: src.id })
  }
  for (const src of pending.values()) {
    const id = newId()
    await tx.insert(periodItems).values({
      id,
      periodId: period.id,
      sourceItemId: src.id,
      name: src.name,
      kind: src.kind,
      amount: src.amount,
      enabled: true,
      sortOrder: src.sortOrder,
    })
    if (src.kind === 'per_unit') perUnit.push({ periodItemId: id, sourceItemId: src.id })
  }

  // điện, nước: chế độ và bảng giá theo cài đặt; chỉ số và tổng tiền giữ nguyên
  const utilRows = await tx.select({ utility: periodUtilities.utility }).from(periodUtilities).where(eq(periodUtilities.periodId, period.id))
  for (const utility of UTILITIES) {
    const conf = cfg.tariffs.get(utility) ?? { mode: 'total' as const, tariff: DEFAULT_TARIFF }
    if (utilRows.some((r) => r.utility === utility)) {
      await tx
        .update(periodUtilities)
        .set({ mode: conf.mode, tariff: conf.tariff })
        .where(and(eq(periodUtilities.periodId, period.id), eq(periodUtilities.utility, utility)))
    } else {
      const prev = await previousCurr(tx, cfg.houseId, ym, utility)
      await tx.insert(periodUtilities).values({ periodId: period.id, utility, mode: conf.mode, tariff: conf.tariff, prev })
    }
  }

  // thành viên: số lượng theo người được khóa theo id của dòng period_items
  const qtyOf = (memberId: string): Record<string, number> => {
    const mine = cfg.qty.get(memberId)
    const out: Record<string, number> = {}
    for (const i of perUnit) {
      const n = mine?.get(i.sourceItemId) ?? 0
      if (n > 0) out[i.periodItemId] = n
    }
    return out
  }
  const present = new Set(
    (await tx.select({ memberId: periodMembers.memberId }).from(periodMembers).where(eq(periodMembers.periodId, period.id))).map(
      (r) => r.memberId,
    ),
  )
  for (const [memberId, m] of cfg.members) {
    const conf = { name: m.name, isOwner: m.role === 'owner', sortOrder: m.sortOrder, qty: qtyOf(memberId) }
    if (present.has(memberId)) {
      await tx
        .update(periodMembers)
        .set(conf)
        .where(and(eq(periodMembers.periodId, period.id), eq(periodMembers.memberId, memberId)))
    } else if (m.active) {
      await tx.insert(periodMembers).values({ periodId: period.id, memberId, ...conf, included: true, days: daysInMonth(ym) })
    }
  }
}

/** Các tháng nháp của nhà, khóa theo thứ tự tháng tăng dần; tháng vừa bị chốt (đang chờ khóa) tự rơi khỏi điều kiện. */
async function lockDrafts(tx: Tx, houseId: string) {
  return tx
    .select({ id: periods.id, year: periods.year, month: periods.month })
    .from(periods)
    .where(and(eq(periods.houseId, houseId), eq(periods.status, 'draft')))
    .orderBy(asc(periods.year), asc(periods.month))
    .for('no key update')
}

/** Chép lại cấu hình nhà vào mọi tháng nháp. Gọi cuối mỗi transaction sửa cài đặt nhà. Không đụng tháng đã chốt. */
export async function syncDraftPeriods(tx: Tx, houseId: string): Promise<void> {
  const cfg = await lockHouseConfig(tx, houseId)
  for (const draft of await lockDrafts(tx, houseId)) await applyConfig(tx, cfg, draft)
}

/**
 * Thêm thành viên vừa vào nhà vào mọi tháng nháp (đủ số ngày của tháng, được tính). Tháng đã chốt giữ nguyên.
 * Gọi trong transaction của `addMemberTx` (dòng nhà đã bị khóa ở đó).
 */
export async function addMemberToDraftsTx(tx: Tx, houseId: string, memberId: string): Promise<void> {
  const [m] = await tx
    .select({ name: user.name, role: houseMembers.role, sortOrder: houseMembers.sortOrder })
    .from(houseMembers)
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(and(eq(houseMembers.id, memberId), eq(houseMembers.houseId, houseId)))
    .limit(1)
  if (!m) throw new AppError('NOT_FOUND', 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên')
  for (const draft of await lockDrafts(tx, houseId)) {
    await tx
      .insert(periodMembers)
      .values({
        periodId: draft.id,
        memberId,
        name: m.name,
        isOwner: m.role === 'owner',
        included: true,
        days: daysInMonth(ymOf(draft)),
        qty: {},
        sortOrder: m.sortOrder,
      })
      .onConflictDoNothing()
  }
}

/** Tháng của nhà (bất kể trạng thái); chưa có thì tạo nháp với bản chụp cấu hình hiện tại. Chạy trong transaction của người gọi. */
export async function findOrCreatePeriodTx(tx: Tx, houseId: string, ym: YM): Promise<PeriodRow> {
  daysInMonth(ym) // kiểm tháng hợp lệ
  const found = await findByYm(tx, houseId, ym)
  if (found) return found
  const cfg = await lockHouseConfig(tx, houseId)
  // đọc lại dưới khóa nhà: lời gọi song song có thể vừa tạo xong
  const again = await findByYm(tx, houseId, ym)
  if (again) return again
  const [row] = await tx
    .insert(periods)
    .values({ id: newId(), houseId, year: ym.year, month: ym.month, status: 'draft', dueDate: dueDateFor(ym, cfg.dueDay) })
    .returning()
  await applyConfig(tx, cfg, row)
  return row
}

/** Tháng nháp của nhà cho tháng `ym`, tạo nếu chưa có. Chỉ chủ nhà. Tháng đã chốt → CONFLICT PERIOD_CLOSED. */
export async function getOrCreateDraftPeriod(db: Db, actor: Actor, houseId: string, ym: YM): Promise<{ periodId: string }> {
  let row: PeriodRow
  try {
    row = await db.transaction(async (tx) => {
      await requireOwner(tx, actor, houseId)
      return findOrCreatePeriodTx(tx, houseId, ym)
    })
  } catch (e) {
    // chỉ mục duy nhất (nhà, năm, tháng) là chốt chặn cuối khi hai lời gọi cùng tạo một tháng
    if (!isUniqueViolation(e)) throw e
    const existing = await findByYm(db, houseId, ym)
    if (!existing) throw e
    row = existing
  }
  if (row.status === 'closed') throw periodClosed(ym)
  return { periodId: row.id }
}

// ───────────────────────── Đọc bản chụp, tính tiền ─────────────────────────

function utilityInput(row: UtilityView | undefined): UtilityInput | null {
  if (!row) return null
  if (row.mode === 'total') return row.total === null ? null : { mode: 'total', total: row.total }
  if (row.prev === null || row.curr === null || !row.tariff) return null
  return { mode: 'tiered', prev: row.prev, curr: row.curr, tariff: row.tariff }
}

async function loadSnapshot(db: Db, period: PeriodRow) {
  const memberRows = await db
    .select()
    .from(periodMembers)
    .where(eq(periodMembers.periodId, period.id))
    .orderBy(asc(periodMembers.sortOrder), asc(periodMembers.memberId))
  const itemRows = await db
    .select()
    .from(periodItems)
    .where(eq(periodItems.periodId, period.id))
    .orderBy(asc(periodItems.sortOrder), asc(periodItems.id))
  const utilRows = await db.select().from(periodUtilities).where(eq(periodUtilities.periodId, period.id))
  const expenseRows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      paidByMemberId: expenses.paidByMemberId,
      spentOn: expenses.spentOn,
    })
    .from(expenses)
    .where(eq(expenses.periodId, period.id))
    .orderBy(asc(expenses.spentOn), asc(expenses.createdAt), asc(expenses.id))

  const utilities = {} as Record<Utility, UtilityView>
  for (const u of UTILITIES) {
    const r = utilRows.find((x) => x.utility === u)
    utilities[u] = r
      ? { mode: r.mode, prev: r.prev, curr: r.curr, total: r.total, tariff: r.tariff }
      : { mode: 'total', prev: null, curr: null, total: null, tariff: null }
  }
  const members: PeriodMember[] = memberRows.map((m) => ({
    memberId: m.memberId,
    name: m.name,
    isOwner: m.isOwner,
    included: m.included,
    days: m.days,
    qty: m.qty,
  }))
  const items: FixedItem[] = itemRows.map((i) => ({ id: i.id, name: i.name, kind: i.kind, amount: i.amount, enabled: i.enabled }))
  const ym = ymOf(period)
  const input: PeriodInput = {
    year: ym.year,
    month: ym.month,
    daysInMonth: daysInMonth(ym),
    members,
    items,
    electricity: utilityInput(utilities.electricity),
    water: utilityInput(utilities.water),
    expenses: expenseRows,
  }
  return { input, utilities }
}

/** Đầu vào tính tiền của tháng, lấy hoàn toàn từ bản chụp của tháng. Điện/nước chưa nhập đủ → null. */
export async function buildPeriodInput(db: Db, periodId: string): Promise<PeriodInput> {
  return (await loadSnapshot(db, await findPeriod(db, periodId))).input
}

/**
 * Tính kết quả để lưu cho tháng đã/sắp chốt. Điện và nước đều phải đã nhập: chế độ "Theo bậc" cần cả chỉ số đầu
 * và cuối, chế độ "Nhập tổng" cần tổng tiền (nhà không dùng thì nhập 0). Thiếu → INVALID UTILITY_MISSING.
 */
async function computeComplete(tx: Tx, period: PeriodRow): Promise<PeriodResult> {
  const { input } = await loadSnapshot(tx, period)
  const missing = UTILITIES.filter((u) => input[u] === null).map((u) => UTILITY_LABEL[u])
  if (missing.length > 0) {
    throw new AppError(
      'INVALID',
      'UTILITY_MISSING',
      `Chưa nhập đủ số liệu ${missing.join(' và ')}. Hãy nhập chỉ số (hoặc tổng tiền) trước khi chốt sổ`,
    )
  }
  return computePeriod(input)
}

/** Sau một lần ghi lên tháng (đã khóa): tháng đã chốt thì tính lại result và tăng revision 1. Trả true nếu là sửa sau chốt. */
export async function recomputeIfClosedTx(tx: Tx, period: PeriodRow): Promise<boolean> {
  if (period.status !== 'closed') return false
  const result = await computeComplete(tx, period)
  await tx
    .update(periods)
    .set({ result, revision: sql`${periods.revision} + 1` })
    .where(eq(periods.id, period.id))
  return true
}

/**
 * Khung chung của mọi thao tác ghi lên một tháng: khóa dòng tháng, chỉ chủ nhà (nhà chưa lưu trữ), ghi,
 * rồi nếu tháng đã chốt thì tính lại + revision += 1 trong cùng transaction và gọi `onPeriodUpdated` SAU khi commit.
 * `write` trả false khi không có gì thay đổi (không tính là một lần sửa).
 */
export async function writePeriod(
  db: Db,
  actor: Actor,
  periodId: string,
  write: (tx: Tx, period: PeriodRow) => Promise<boolean>,
): Promise<void> {
  const edited = await db.transaction(async (tx) => {
    const period = await lockPeriod(tx, periodId)
    await requireOwner(tx, actor, period.houseId)
    if (!(await write(tx, period))) return false
    return recomputeIfClosedTx(tx, period)
  })
  if (edited) await onPeriodUpdated(db, periodId)
}

// ───────────────────────── Nhập số liệu tháng ─────────────────────────

function readingValue(v: number | null | undefined): number | null | undefined {
  if (v === undefined || v === null) return v
  if (!Number.isSafeInteger(v) || v < 0 || v > READING_MAX) {
    throw new AppError('INVALID', 'READING_INVALID', 'Chỉ số phải là số nguyên không âm')
  }
  return v
}

function totalValue(v: number | null | undefined): number | null | undefined {
  if (v === undefined || v === null) return v
  if (!Number.isSafeInteger(v) || v < 0 || v > MAX_MONEY) {
    throw new AppError('INVALID', 'AMOUNT_INVALID', 'Tổng tiền phải là số nguyên đồng, không âm và không quá 100 tỷ')
  }
  return v
}

/** Chỉ số cuối vừa đổi → điền làm chỉ số đầu của tháng kế tiếp nếu tháng đó còn nháp và chỉ số đầu chưa bị sửa tay. */
async function carryReadingForward(tx: Tx, period: PeriodRow, utility: Utility, oldCurr: number | null, newCurr: number): Promise<void> {
  const next = await findByYm(tx, period.houseId, shiftMonth(ymOf(period), 1))
  if (!next || next.status !== 'draft') return
  const locked = await lockPeriod(tx, next.id)
  if (locked.status !== 'draft') return
  const [row] = await tx
    .select({ prev: periodUtilities.prev, curr: periodUtilities.curr })
    .from(periodUtilities)
    .where(and(eq(periodUtilities.periodId, next.id), eq(periodUtilities.utility, utility)))
    .limit(1)
  if (!row || row.prev !== oldCurr) return
  if (row.curr !== null && row.curr < newCurr) return
  await tx
    .update(periodUtilities)
    .set({ prev: newCurr })
    .where(and(eq(periodUtilities.periodId, next.id), eq(periodUtilities.utility, utility)))
}

/**
 * Nhập chỉ số đầu/cuối hoặc tổng tiền điện/nước. `undefined` = giữ nguyên, `null` = xóa.
 * Chỉ số cuối < chỉ số đầu → INVALID READING_DECREASED. Chế độ của tháng đã chốt giữ như lúc chụp.
 */
export async function setUtilityReading(
  db: Db,
  actor: Actor,
  periodId: string,
  utility: Utility,
  input: { prev?: number | null; curr?: number | null; total?: number | null },
): Promise<void> {
  await writePeriod(db, actor, periodId, async (tx, period) => {
    if (utility !== 'electricity' && utility !== 'water') throw new AppError('INVALID', 'UTILITY', 'Loại tiện ích không hợp lệ')
    const prev = readingValue(input.prev)
    const curr = readingValue(input.curr)
    const total = totalValue(input.total)
    const where = and(eq(periodUtilities.periodId, period.id), eq(periodUtilities.utility, utility))
    const [row] = await tx.select().from(periodUtilities).where(where).limit(1)
    if (!row) throw new AppError('NOT_FOUND', 'UTILITY_NOT_FOUND', 'Không tìm thấy số liệu điện nước của tháng này')
    const next = {
      prev: prev === undefined ? row.prev : prev,
      curr: curr === undefined ? row.curr : curr,
      total: total === undefined ? row.total : total,
    }
    if (next.prev !== null && next.curr !== null && next.curr < next.prev) {
      throw new AppError('INVALID', 'READING_DECREASED', 'Chỉ số mới phải ≥ chỉ số cũ')
    }
    await tx.update(periodUtilities).set(next).where(where)
    if (next.curr !== null && next.curr !== row.curr) await carryReadingForward(tx, period, utility, row.curr, next.curr)
    return true
  })
}

/** Số ngày ở (0..số ngày của tháng) và "Tính tháng này" của một thành viên trong tháng. */
export async function setPeriodMember(
  db: Db,
  actor: Actor,
  periodId: string,
  memberId: string,
  input: { days?: number; included?: boolean },
): Promise<void> {
  await writePeriod(db, actor, periodId, async (tx, period) => {
    const where = and(eq(periodMembers.periodId, period.id), eq(periodMembers.memberId, memberId))
    const [row] = await tx.select({ memberId: periodMembers.memberId }).from(periodMembers).where(where).limit(1)
    if (!row) throw new AppError('NOT_FOUND', 'MEMBER_NOT_IN_PERIOD', 'Thành viên này không có trong tháng')
    const set: { days?: number; included?: boolean } = {}
    if (input.days !== undefined) {
      const N = daysInMonth(ymOf(period))
      if (!Number.isInteger(input.days) || input.days < 0 || input.days > N) {
        throw new AppError('INVALID', 'DAYS_INVALID', `Số ngày ở phải là số nguyên từ 0 đến ${N}`)
      }
      set.days = input.days
    }
    if (input.included !== undefined) {
      if (typeof input.included !== 'boolean') throw new AppError('INVALID', 'INCLUDED_INVALID', 'Giá trị "Tính tháng này" không hợp lệ')
      set.included = input.included
    }
    if (Object.keys(set).length === 0) return false
    await tx.update(periodMembers).set(set).where(where)
    return true
  })
}

/** Bật/tắt một khoản cố định trong tháng. */
export async function setPeriodItemEnabled(db: Db, actor: Actor, periodItemId: string, enabled: boolean): Promise<void> {
  const [item] = await db.select({ periodId: periodItems.periodId }).from(periodItems).where(eq(periodItems.id, periodItemId)).limit(1)
  if (!item) throw new AppError('NOT_FOUND', 'ITEM_NOT_FOUND', 'Không tìm thấy khoản này')
  await writePeriod(db, actor, item.periodId, async (tx) => {
    if (typeof enabled !== 'boolean') throw new AppError('INVALID', 'ENABLED_INVALID', 'Giá trị bật/tắt không hợp lệ')
    const updated = await tx.update(periodItems).set({ enabled }).where(eq(periodItems.id, periodItemId)).returning({ id: periodItems.id })
    // khoản vừa bị gỡ khỏi tháng nháp bởi lần đồng bộ cài đặt
    if (updated.length === 0) throw new AppError('NOT_FOUND', 'ITEM_NOT_FOUND', 'Không tìm thấy khoản này')
    return true
  })
}

// ───────────────────────── Xem trước, chốt sổ, xem ─────────────────────────

/** Tính thử từ bản chụp hiện tại, không ghi gì. Chỉ chủ nhà. */
export async function previewPeriod(db: Db, actor: Actor, periodId: string): Promise<PeriodResult> {
  const period = await findPeriod(db, periodId)
  await requireOwner(db, actor, period.houseId)
  return computePeriod((await loadSnapshot(db, period)).input)
}

/** Chốt sổ: lưu result, status 'closed', closedAt. Gọi `onPeriodClosed` sau khi commit. */
export async function closePeriod(db: Db, actor: Actor, periodId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const period = await lockPeriod(tx, periodId)
    await requireOwner(tx, actor, period.houseId)
    if (period.status === 'closed') throw periodClosed(ymOf(period))
    const result = await computeComplete(tx, period)
    await tx.update(periods).set({ status: 'closed', closedAt: new Date(), result }).where(eq(periods.id, periodId))
  })
  await onPeriodClosed(db, periodId)
}

/** Cả nhà xem được tháng đã chốt (kể cả nhà đã lưu trữ); tháng nháp chỉ chủ nhà xem. */
export async function getPeriodView(db: Db, actor: Actor, periodId: string): Promise<PeriodView> {
  const period = await findPeriod(db, periodId)
  const me = await requireMember(db, actor, period.houseId)
  if (period.status === 'draft' && me.role !== 'owner') {
    throw new AppError('FORBIDDEN', 'PERIOD_DRAFT', 'Tháng này chưa chốt sổ')
  }
  const { input, utilities } = await loadSnapshot(db, period)
  const result = period.status === 'closed' && period.result ? period.result : computePeriod(input)
  return {
    period: {
      id: period.id,
      houseId: period.houseId,
      year: period.year,
      month: period.month,
      status: period.status,
      dueDate: period.dueDate,
      closedAt: period.closedAt,
      revision: period.revision,
    },
    result,
    members: input.members,
    items: input.items,
    utilities,
    expenses: input.expenses,
  }
}

/** Các tháng của nhà, mới nhất trước. Thành viên chỉ thấy tháng đã chốt; tháng nháp có grandTotal null. */
export async function listPeriods(db: Db, actor: Actor, houseId: string): Promise<PeriodListItem[]> {
  const me = await requireMember(db, actor, houseId)
  const rows = await db
    .select({ id: periods.id, year: periods.year, month: periods.month, status: periods.status, result: periods.result })
    .from(periods)
    .where(me.role === 'owner' ? eq(periods.houseId, houseId) : and(eq(periods.houseId, houseId), eq(periods.status, 'closed')))
    .orderBy(desc(periods.year), desc(periods.month))
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    status: r.status,
    grandTotal: r.status === 'closed' ? (r.result?.grandTotal ?? null) : null,
  }))
}
