import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { expenses, periodMembers, periods, user } from '@/db/schema'
import { consumptionMonthDefault, daysInMonth, resolveExpenseMonth } from '@/lib/billing/period-month'
import type { YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { EXPENSE_MAX } from '@/lib/validation'
import { todayVn } from '@/lib/vn-time'
import type { Actor } from './actor'
import { requireActiveMember, requireMember, type Tx } from './houses'
import { onPeriodUpdated } from './period-events'
import { findOrCreatePeriodTx, recomputeIfClosedTx, writePeriod, type PeriodRow } from './periods'

const DESCRIPTION_MAX = 100
/** Số lần tính lại tháng đích khi tháng vừa chọn bị chốt ngay trong lúc thêm khoản chi. */
const RESOLVE_ATTEMPTS = 3
/** Số người tối đa trong danh sách chia của một khoản chi (nhà trọ không có chừng đó người; chặn dữ liệu bất thường). */
const MAX_PARTICIPANTS = 50

/** `participantIds`: người cùng chịu khoản chi; undefined = giữ nguyên, null = cả nhà. */
export type ExpensePatch = { description?: string; amount?: number; spentOn?: string; paidByMemberId?: string; participantIds?: string[] | null }

function cleanDescription(raw: string): string {
  const d = typeof raw === 'string' ? raw.trim() : ''
  if (d.length < 1 || d.length > DESCRIPTION_MAX) {
    throw new AppError('INVALID', 'DESCRIPTION_INVALID', `Nội dung khoản chi gồm 1–${DESCRIPTION_MAX} ký tự`)
  }
  return d
}

function cleanAmount(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1 || n > EXPENSE_MAX) {
    throw new AppError('INVALID', 'AMOUNT_INVALID', 'Số tiền phải là số nguyên đồng, lớn hơn 0 và không quá 100.000.000 đ')
  }
  return n
}

/** Tháng dương lịch của ngày chi; ngày sai → INVALID SPENT_ON_INVALID. */
function monthOfSpentOn(spentOn: string): YM {
  return resolveExpenseMonth(spentOn, [])
}

/**
 * Thành viên không được tạo tháng mới: khoản chi chỉ vào tháng đã có (chủ nhà đã mở) hoặc tháng từ "tháng tiêu thụ mặc định"
 * (tháng liền trước tháng hiện tại) trở đi. Ngày chi ở tháng quá khứ chưa có hóa đơn (gõ nhầm năm, bấm lùi quá tay)
 * không được tạo ra một tháng nháp lạ chen vào màn Tạo của chủ nhà.
 */
async function assertMemberMonthOpen(tx: Tx, houseId: string, ym: YM): Promise<void> {
  const [existing] = await tx
    .select({ id: periods.id })
    .from(periods)
    .where(and(eq(periods.houseId, houseId), eq(periods.year, ym.year), eq(periods.month, ym.month)))
    .limit(1)
  if (existing) return
  const floor = consumptionMonthDefault(new Date())
  if (ym.year * 12 + ym.month < floor.year * 12 + floor.month) {
    throw new AppError('FORBIDDEN', 'MONTH_NOT_OPEN', 'Tháng của ngày chi này đã qua và chưa có hóa đơn. Hãy nhờ chủ nhà ghi giúp')
  }
}

/** Giới hạn riêng của thành viên: tự mình là người trả, và không ghi khoản chi ở ngày chưa tới. */
function assertMemberExpense(selfId: string, payerId: string | undefined, spentOn: string | undefined): void {
  if (payerId !== undefined && payerId !== selfId) {
    throw new AppError('FORBIDDEN', 'PAYER_NOT_SELF', 'Bạn chỉ ghi được khoản chi do chính mình trả. Nhờ chủ nhà ghi giúp nếu người khác trả')
  }
  if (spentOn !== undefined && spentOn > todayVn(new Date())) {
    throw new AppError('INVALID', 'SPENT_ON_FUTURE', 'Ngày chi chưa tới, hãy chọn ngày hôm nay hoặc trước đó')
  }
}

/**
 * Kiểm quyền sửa/xóa một khoản chi, chạy sau khi tháng đã bị khóa: chủ nhà (nhà chưa lưu trữ) sửa được mọi khoản;
 * thành viên chỉ sửa được khoản chính mình thêm và chỉ khi tháng còn nháp (tháng đã chốt đã có người trả theo số cũ).
 */
function authorizeExpenseWrite(actor: Actor, expenseId: string, patch?: ExpensePatch) {
  return async (tx: Tx, period: PeriodRow): Promise<void> => {
    const me = await requireActiveMember(tx, actor, period.houseId)
    if (me.role === 'owner') return
    const [row] = await tx
      .select({ createdBy: expenses.createdBy, paidByMemberId: expenses.paidByMemberId })
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1)
    if (!row) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
    if (row.createdBy !== actor.userId) {
      throw new AppError('FORBIDDEN', 'NOT_EXPENSE_AUTHOR', 'Bạn chỉ sửa được khoản chi do chính mình thêm')
    }
    // chủ nhà đã chuyển người trả sang người khác: khoản đó không còn là "khoản mình trả", nhờ chủ nhà sửa tiếp
    if (row.paidByMemberId !== me.id) {
      throw new AppError('FORBIDDEN', 'EXPENSE_REASSIGNED', 'Chủ nhà đã đổi người trả khoản chi này, hãy nhờ chủ nhà sửa')
    }
    if (period.status !== 'draft') {
      throw new AppError('FORBIDDEN', 'PERIOD_CLOSED', 'Tháng này đã chốt sổ, hãy nhờ chủ nhà sửa')
    }
    if (patch) assertMemberExpense(me.id, patch.paidByMemberId, patch.spentOn)
  }
}

/**
 * Danh sách người cùng chịu khoản chi: không chỉ định → null (cả nhà, theo những ai được tính ở thời điểm tính tiền);
 * có chỉ định thì phải có ít nhất một người và mọi người đều thuộc tháng của khoản chi (bỏ id lặp, giữ thứ tự).
 */
async function cleanParticipants(
  tx: Tx,
  periodId: string,
  ids: string[] | null | undefined,
  /** Thành viên (không phải chủ nhà) phải chọn ít nhất một người đang được tính tháng này: không để họ làm tháng không tính được. */
  opts: { onlyCounted: boolean },
): Promise<string[] | null> {
  if (ids === undefined || ids === null) return null
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new AppError('INVALID', 'PARTICIPANTS_INVALID', 'Danh sách người chia khoản chi không hợp lệ')
  }
  const unique = [...new Set(ids)]
  if (unique.length === 0) throw new AppError('INVALID', 'PARTICIPANTS_INVALID', 'Hãy chọn ít nhất một người chia khoản chi')
  if (unique.length > MAX_PARTICIPANTS) throw new AppError('INVALID', 'PARTICIPANTS_INVALID', 'Danh sách người chia quá dài')
  const found = await tx
    .select({ memberId: periodMembers.memberId, included: periodMembers.included, name: periodMembers.name })
    .from(periodMembers)
    .where(and(eq(periodMembers.periodId, periodId), inArray(periodMembers.memberId, unique)))
  if (found.length !== unique.length) {
    throw new AppError('INVALID', 'PARTICIPANT_NOT_IN_PERIOD', 'Có người được chọn chia không thuộc tháng của khoản chi này')
  }
  // người không được tính bị bỏ qua khi tính tiền, nên chỉ cần còn ít nhất một người được tính để khoản chi không "mất chỗ chia"
  if (opts.onlyCounted && !found.some((m) => m.included)) {
    throw new AppError(
      'INVALID',
      'PARTICIPANT_NOT_COUNTED',
      `${found.map((m) => m.name).join(', ')} không được tính trong tháng này nên khoản chi sẽ không có ai để chia. Hãy chọn thêm người khác`,
    )
  }
  return unique
}

function sameParticipants(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b
  return a.length === b.length && a.every((id) => b.includes(id))
}

async function assertPayerInPeriod(tx: Tx, periodId: string, memberId: string): Promise<void> {
  const [row] = await tx
    .select({ memberId: periodMembers.memberId })
    .from(periodMembers)
    .where(and(eq(periodMembers.periodId, periodId), eq(periodMembers.memberId, memberId)))
    .limit(1)
  if (!row) throw new AppError('INVALID', 'PAYER_NOT_IN_PERIOD', 'Người trả không có trong danh sách thành viên của tháng này')
}

/**
 * Thêm khoản chi lẻ. Không chỉ định `ym`: tính vào tháng của ngày chi, nếu tháng đó đã chốt thì sang tháng chưa chốt
 * kế tiếp (`movedFromClosed: true`); tháng đích chưa có thì tự tạo nháp. Chỉ định `ym` của tháng đã chốt
 * là sửa sau chốt: tháng đó được tính lại, revision += 1 và `onPeriodUpdated` được gọi sau khi commit.
 */
export async function addExpense(
  db: Db,
  actor: Actor,
  houseId: string,
  input: { description: string; amount: number; spentOn: string; paidByMemberId: string; participantIds?: string[] | null; ym?: YM },
): Promise<{ expenseId: string; ym: YM; movedFromClosed: boolean }> {
  const outcome = await db.transaction(async (tx) => {
    const me = await requireActiveMember(tx, actor, houseId)
    // thành viên chỉ nhập được khoản chi do chính mình trả, vào tháng nháp (không chọn tháng đã chốt)
    if (me.role !== 'owner') {
      if (input.ym) throw new AppError('FORBIDDEN', 'NOT_OWNER', 'Chỉ chủ nhà được chọn tháng cho khoản chi')
      assertMemberExpense(me.id, input.paidByMemberId, input.spentOn)
    }
    const description = cleanDescription(input.description)
    const amount = cleanAmount(input.amount)
    const spentMonth = monthOfSpentOn(input.spentOn)
    const explicit = input.ym ? { year: input.ym.year, month: input.ym.month } : null
    if (explicit) daysInMonth(explicit) // kiểm tháng hợp lệ

    for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt++) {
      const ym =
        explicit ??
        resolveExpenseMonth(
          input.spentOn,
          await tx.select({ year: periods.year, month: periods.month, status: periods.status }).from(periods).where(eq(periods.houseId, houseId)),
        )
      if (me.role !== 'owner') await assertMemberMonthOpen(tx, houseId, ym)
      const found = await findOrCreatePeriodTx(tx, houseId, ym)
      const [period] = await tx.select().from(periods).where(eq(periods.id, found.id)).for('no key update').limit(1)
      // tháng vừa bị chốt giữa lúc đọc và lúc khóa: tính lại tháng đích
      if (!explicit && period.status === 'closed') continue
      await assertPayerInPeriod(tx, period.id, input.paidByMemberId)
      const participantIds = await cleanParticipants(tx, period.id, input.participantIds, { onlyCounted: me.role !== 'owner' })
      const expenseId = newId()
      await tx.insert(expenses).values({
        id: expenseId,
        houseId,
        periodId: period.id,
        description,
        amount,
        paidByMemberId: input.paidByMemberId,
        spentOn: input.spentOn,
        participantIds,
        createdBy: actor.userId,
      })
      const edited = await recomputeIfClosedTx(tx, period)
      const movedFromClosed = !explicit && (ym.year !== spentMonth.year || ym.month !== spentMonth.month)
      return { expenseId, ym, movedFromClosed, periodId: period.id, edited }
    }
    throw new AppError('CONFLICT', 'PERIOD_CLOSED', 'Tháng này vừa được chốt sổ, hãy thử lại')
  })
  if (outcome.edited) await onPeriodUpdated(db, outcome.periodId)
  return { expenseId: outcome.expenseId, ym: outcome.ym, movedFromClosed: outcome.movedFromClosed }
}

async function periodOfExpense(db: Db, expenseId: string): Promise<string> {
  const [row] = await db.select({ periodId: expenses.periodId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
  return row.periodId
}

/**
 * Sửa khoản chi. Khoản chi ở lại tháng nó đang thuộc về (đổi ngày chi không chuyển tháng; muốn chuyển thì xóa rồi thêm lại).
 * Tháng đã chốt → tính lại, revision += 1, `onPeriodUpdated`.
 */
export async function updateExpense(db: Db, actor: Actor, expenseId: string, patch: ExpensePatch): Promise<void> {
  const periodId = await periodOfExpense(db, expenseId)
  await writePeriod(
    db,
    actor,
    periodId,
    async (tx, period) => {
      const where = and(eq(expenses.id, expenseId), eq(expenses.periodId, periodId))
      const [row] = await tx
        .select({
          description: expenses.description,
          amount: expenses.amount,
          spentOn: expenses.spentOn,
          paidByMemberId: expenses.paidByMemberId,
          participantIds: expenses.participantIds,
        })
        .from(expenses)
        .where(where)
        .limit(1)
      if (!row) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
      // chỉ ghi trường thật sự đổi: ghi lại đúng giá trị cũ không tính là một lần sửa
      const set: Partial<typeof expenses.$inferInsert> = {}
      if (patch.description !== undefined) {
        const description = cleanDescription(patch.description)
        if (description !== row.description) set.description = description
      }
      if (patch.amount !== undefined) {
        const amount = cleanAmount(patch.amount)
        if (amount !== row.amount) set.amount = amount
      }
      if (patch.spentOn !== undefined) {
        monthOfSpentOn(patch.spentOn)
        if (patch.spentOn !== row.spentOn) set.spentOn = patch.spentOn
      }
      if (patch.paidByMemberId !== undefined && patch.paidByMemberId !== row.paidByMemberId) {
        await assertPayerInPeriod(tx, periodId, patch.paidByMemberId)
        set.paidByMemberId = patch.paidByMemberId
      }
      if (patch.participantIds !== undefined) {
        const isOwner = (await requireActiveMember(tx, actor, period.houseId)).role === 'owner'
        const next = await cleanParticipants(tx, periodId, patch.participantIds, { onlyCounted: !isOwner })
        if (!sameParticipants(next, row.participantIds)) set.participantIds = next
      }
      if (Object.keys(set).length === 0) return false
      await tx.update(expenses).set(set).where(where)
      return true
    },
    authorizeExpenseWrite(actor, expenseId, patch),
  )
}

/** Xóa khoản chi. Tháng đã chốt → tính lại, revision += 1, `onPeriodUpdated`. */
export async function deleteExpense(db: Db, actor: Actor, expenseId: string): Promise<void> {
  const periodId = await periodOfExpense(db, expenseId)
  await writePeriod(
    db,
    actor,
    periodId,
    async (tx) => {
      const deleted = await tx
        .delete(expenses)
        .where(and(eq(expenses.id, expenseId), eq(expenses.periodId, periodId)))
        .returning({ id: expenses.id })
      if (deleted.length === 0) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
      return true
    },
    authorizeExpenseWrite(actor, expenseId),
  )
}

export type MyExpense = {
  id: string
  description: string
  amount: number
  spentOn: string
  paidByMemberId: string
  participantIds: string[] | null
  ym: YM
}

/**
 * Khoản chi chính mình đã thêm ở các tháng còn nháp (mới nhất trước): danh sách để thành viên sửa hoặc xóa khoản vừa nhập.
 * Tháng đã chốt thì chủ nhà giữ quyền sửa.
 */
export async function listMyExpenses(db: Db, actor: Actor, houseId: string): Promise<MyExpense[]> {
  await requireActiveMember(db, actor, houseId)
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      spentOn: expenses.spentOn,
      paidByMemberId: expenses.paidByMemberId,
      participantIds: expenses.participantIds,
      year: periods.year,
      month: periods.month,
    })
    .from(expenses)
    .innerJoin(periods, eq(periods.id, expenses.periodId))
    .where(and(eq(expenses.houseId, houseId), eq(expenses.createdBy, actor.userId), eq(periods.status, 'draft')))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
    .limit(30)
  return rows.map(({ year, month, ...e }) => ({ ...e, ym: { year, month } }))
}

export type LedgerExpense = {
  id: string
  description: string
  amount: number
  spentOn: string
  paidByMemberId: string
  paidByName: string
  createdByName: string
  /** null = cả nhà. */
  participants: { id: string; name: string }[] | null
  /** Khoản do chính người xem nhập. */
  mine: boolean
}
export type LedgerMonth = { periodId: string; ym: YM; status: 'draft' | 'closed'; expenses: LedgerExpense[] }

const LEDGER_MONTHS = 6

/** Khoản chi của các tháng đã cho (người xem đã được kiểm quyền): ai trả, ai nhập, chia cho ai. Mới nhất trước. */
async function loadLedger(db: Db, actorUserId: string, houseId: string, periodIds: string[]): Promise<LedgerMonth[]> {
  if (periodIds.length === 0) return []
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      spentOn: expenses.spentOn,
      paidByMemberId: expenses.paidByMemberId,
      participantIds: expenses.participantIds,
      createdBy: expenses.createdBy,
      createdByName: user.name,
      periodId: periods.id,
      year: periods.year,
      month: periods.month,
      status: periods.status,
    })
    .from(expenses)
    .innerJoin(periods, eq(periods.id, expenses.periodId))
    .innerJoin(user, eq(user.id, expenses.createdBy))
    .where(and(eq(expenses.houseId, houseId), inArray(expenses.periodId, periodIds)))
    .orderBy(desc(periods.year), desc(periods.month), desc(expenses.spentOn), desc(expenses.createdAt))
  const people = await db
    .select({ periodId: periodMembers.periodId, memberId: periodMembers.memberId, name: periodMembers.name })
    .from(periodMembers)
    .where(inArray(periodMembers.periodId, periodIds))
  const nameOf = new Map(people.map((p) => [`${p.periodId}:${p.memberId}`, p.name]))
  const months = new Map<string, LedgerMonth>()
  for (const r of rows) {
    const name = (id: string) => nameOf.get(`${r.periodId}:${id}`) ?? '—'
    let month = months.get(r.periodId)
    if (!month) {
      month = { periodId: r.periodId, ym: { year: r.year, month: r.month }, status: r.status, expenses: [] }
      months.set(r.periodId, month)
    }
    month.expenses.push({
      id: r.id,
      description: r.description,
      amount: r.amount,
      spentOn: r.spentOn,
      paidByMemberId: r.paidByMemberId,
      paidByName: name(r.paidByMemberId),
      createdByName: r.createdByName,
      participants: r.participantIds ? r.participantIds.map((id) => ({ id, name: name(id) })) : null,
      mine: r.createdBy === actorUserId,
    })
  }
  return [...months.values()]
}

export type ExpenseMonthSummary = {
  periodId: string
  ym: YM
  status: 'draft' | 'closed'
  /** Tổng các khoản chi lẻ của tháng (không gồm khoản cố định, điện, nước). */
  total: number
  count: number
  /** Mỗi người đã ứng bao nhiêu, nhiều nhất trước. */
  byPayer: { memberId: string; name: string; total: number; count: number }[]
}

/**
 * View nhanh theo tháng cho MỌI thành viên đang ở (kể cả tháng còn nháp): tổng chi lẻ, số khoản và người ứng của từng
 * tháng. Mới nhất trước, tối đa `LEDGER_MONTHS` tháng có khoản chi. Không trả điện/nước/tổng tháng. Nhà đã lưu trữ vẫn xem được.
 */
export async function summarizeHouseExpenses(db: Db, actor: Actor, houseId: string): Promise<ExpenseMonthSummary[]> {
  await requireMember(db, actor, houseId)
  // chỉ nạp các tháng gần nhất có khoản chi, không kéo cả lịch sử của nhà về rồi mới cắt
  const recent = await db
    .selectDistinct({ id: periods.id, year: periods.year, month: periods.month })
    .from(periods)
    .innerJoin(expenses, eq(expenses.periodId, periods.id))
    .where(eq(periods.houseId, houseId))
    .orderBy(desc(periods.year), desc(periods.month))
    .limit(LEDGER_MONTHS)
  const months = await loadLedger(db, actor.userId, houseId, recent.map((p) => p.id))
  return months.map((m) => {
    const payers = new Map<string, { memberId: string; name: string; total: number; count: number }>()
    for (const e of m.expenses) {
      const p = payers.get(e.paidByMemberId) ?? { memberId: e.paidByMemberId, name: e.paidByName, total: 0, count: 0 }
      payers.set(e.paidByMemberId, { ...p, total: p.total + e.amount, count: p.count + 1 })
    }
    return {
      periodId: m.periodId,
      ym: m.ym,
      status: m.status,
      total: m.expenses.reduce((s, e) => s + e.amount, 0),
      count: m.expenses.length,
      byPayer: [...payers.values()].sort((a, b) => b.total - a.total),
    }
  })
}

export type PeriodExpenses = LedgerMonth & { houseId: string; total: number }

/**
 * Chi tiết khoản chi lẻ của MỘT tháng (màn riêng): mọi thành viên đang ở xem được, kể cả tháng còn nháp. Tháng chưa có
 * khoản nào trả danh sách rỗng. Người ngoài nhà hoặc đã rời → FORBIDDEN; id lạ → NOT_FOUND.
 */
export async function getPeriodExpenses(db: Db, actor: Actor, periodId: string): Promise<PeriodExpenses> {
  const [period] = await db
    .select({ id: periods.id, houseId: periods.houseId, year: periods.year, month: periods.month, status: periods.status })
    .from(periods)
    .where(eq(periods.id, periodId))
    .limit(1)
  if (!period) throw new AppError('NOT_FOUND', 'PERIOD_NOT_FOUND', 'Không tìm thấy tháng')
  await requireMember(db, actor, period.houseId)
  const [month] = await loadLedger(db, actor.userId, period.houseId, [period.id])
  const list = month?.expenses ?? []
  return {
    periodId: period.id,
    houseId: period.houseId,
    ym: { year: period.year, month: period.month },
    status: period.status,
    expenses: list,
    total: list.reduce((s, e) => s + e.amount, 0),
  }
}
