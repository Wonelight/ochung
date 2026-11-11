import { randomInt } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { houseMembers, houses, periodMembers, user, utilityTariffs } from '@/db/schema'
import type { Tariff } from '@/lib/billing/types'
import { avatarSeed } from '@/lib/avatar-seed'
import { ACCOUNT_NO_PATTERN } from '@/lib/banks'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import { hasOutstandingBalance } from './payments'
import { addMemberToDraftsTx } from './periods'

export type Member = {
  id: string
  houseId: string
  userId: string
  role: 'owner' | 'member'
  sortOrder: number
  displayName: string
  /** Số lần "Tạo hình mới" của người đó: cùng tên hiển thị tạo ra hạt giống của ảnh đại diện (`avatarSeed`). */
  avatarVariant: number
  leftAt: Date | null
}

export type HouseSummary = {
  houseId: string
  name: string
  role: 'owner' | 'member'
  archived: boolean
  /** Người dùng đã rời (hoặc bị xóa khỏi) nhà này: chỉ xem lại được các tháng đã chốt có tên mình. */
  former: boolean
}

/** Transaction của `db.transaction`, để `addMemberTx` dùng chung với các luồng vào nhà ở Task 9. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const NAME_MAX = 60
const DUE_DAY_MIN = 1
const DUE_DAY_MAX = 28
const CODE_ATTEMPTS = 20
const CODE_FALLBACK_PREFIX = 'NH'
// bỏ 0, O, 1, I cho dễ đọc
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Bảng giá khởi tạo: chế độ "Nhập tổng" không dùng bậc, chủ nhà cài bậc sau nếu chuyển sang "Theo bậc". */
export const DEFAULT_TARIFF: Tariff = { tiers: [], perPerson: false, registeredPeople: 1, vatPct: 0, surcharges: [] }

/** Hai chữ cái đầu của mã nhà: chữ cái đầu của hai từ cuối tên (bỏ dấu), một từ thì lấy hai chữ đầu, không có chữ thì `NH`. */
export function houseCodePrefix(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean)
  if (words.length >= 2) {
    return words
      .slice(-2)
      .map((w) => w[0])
      .join('')
  }
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2)
  return CODE_FALLBACK_PREFIX
}

/** Mã nhà `XX-XXXX`: 2 chữ cái (theo tên nhà) + 4 ký tự [A-Z2-9] không gồm 0, O, 1, I; thử lại khi trùng (tối đa 20 lần). */
export async function generateHouseCode(
  exists: (code: string) => Promise<boolean>,
  prefix: string = CODE_FALLBACK_PREFIX,
): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    let suffix = ''
    for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    const code = `${prefix}-${suffix}`
    if (!(await exists(code))) return code
  }
  throw new Error('Không sinh được mã nhà chưa dùng sau nhiều lần thử')
}

function cleanName(raw: string): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > NAME_MAX) {
    throw new AppError('INVALID', 'HOUSE_NAME', `Tên nhà gồm 1–${NAME_MAX} ký tự`)
  }
  return name
}

export async function createHouse(db: Db, actor: Actor, input: { name: string }): Promise<{ houseId: string; code: string }> {
  const name = cleanName(input.name)
  const code = await generateHouseCode(
    async (c) => (await db.select({ id: houses.id }).from(houses).where(eq(houses.code, c)).limit(1)).length > 0,
    houseCodePrefix(name),
  )
  const houseId = newId()
  await db.transaction(async (tx) => {
    await tx.insert(houses).values({ id: houseId, name, code, ownerUserId: actor.userId })
    await tx.insert(houseMembers).values({ id: newId(), houseId, userId: actor.userId, role: 'owner', sortOrder: 0 })
    await tx.insert(utilityTariffs).values([
      { houseId, utility: 'electricity', mode: 'total', tariff: DEFAULT_TARIFF },
      { houseId, utility: 'water', mode: 'total', tariff: DEFAULT_TARIFF },
    ])
  })
  return { houseId, code }
}

const memberColumns = {
  id: houseMembers.id,
  houseId: houseMembers.houseId,
  userId: houseMembers.userId,
  role: houseMembers.role,
  sortOrder: houseMembers.sortOrder,
  displayName: user.name,
  avatarVariant: user.avatarVariant,
  leftAt: houseMembers.leftAt,
}

/** Thành viên đang hoạt động của nhà (kể cả nhà đã lưu trữ, để xem lịch sử). Người ngoài hoặc đã rời → FORBIDDEN. */
export async function requireMember(db: Db, actor: Actor, houseId: string): Promise<Member> {
  const [row] = await db
    .select(memberColumns)
    .from(houseMembers)
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(and(eq(houseMembers.houseId, houseId), eq(houseMembers.userId, actor.userId), isNull(houseMembers.leftAt)))
    .limit(1)
  if (!row) throw new AppError('FORBIDDEN', 'NOT_MEMBER', 'Bạn không thuộc nhà này')
  return row
}

/**
 * Người đang ở hoặc từng ở nhà. `former`: không còn dòng đang ở (đã rời hoặc bị xóa) — `member` là dòng gần nhất;
 * người đó chỉ được XEM lịch sử (xem `requirePeriodViewer`), mọi thao tác ghi vẫn đi qua `requireMember`/`requireOwner`.
 * `memberIds`: mọi dòng thành viên của người đó trong nhà (rời rồi vào lại thì có nhiều dòng). Người ngoài → FORBIDDEN.
 */
export type Viewer = { member: Member; former: boolean; memberIds: string[] }

export async function requireViewer(db: Db, actor: Actor, houseId: string): Promise<Viewer> {
  const rows = await db
    .select(memberColumns)
    .from(houseMembers)
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(and(eq(houseMembers.houseId, houseId), eq(houseMembers.userId, actor.userId)))
    .orderBy(desc(houseMembers.joinedAt))
  if (rows.length === 0) throw new AppError('FORBIDDEN', 'NOT_MEMBER', 'Bạn không thuộc nhà này')
  const active = rows.find((r) => r.leftAt === null)
  return { member: active ?? rows[0], former: !active, memberIds: rows.map((r) => r.id) }
}

/** Người xem một tháng; `memberId` là dòng thành viên của người đó dùng cho tháng này (tìm phiếu, bản ghi của mình). */
export type PeriodViewer = { memberId: string; role: 'owner' | 'member'; former: boolean }

/**
 * Ai được đọc một tháng (và báo chuyển phần còn nợ của mình): thành viên đang ở — mọi tháng của nhà (tháng nháp với
 * thành viên thường do người gọi chặn); người đã rời — chỉ tháng ĐÃ CHỐT có tên họ trong bản chụp thành viên của tháng.
 * Còn lại → FORBIDDEN NOT_MEMBER.
 */
export async function requirePeriodViewer(
  db: Db,
  actor: Actor,
  period: { id: string; houseId: string; status: 'draft' | 'closed' },
): Promise<PeriodViewer> {
  const v = await requireViewer(db, actor, period.houseId)
  if (!v.former) return { memberId: v.member.id, role: v.member.role, former: false }
  if (period.status === 'closed') {
    const [row] = await db
      .select({ memberId: periodMembers.memberId })
      .from(periodMembers)
      .where(and(eq(periodMembers.periodId, period.id), inArray(periodMembers.memberId, v.memberIds)))
      .limit(1)
    if (row) return { memberId: row.memberId, role: 'member', former: true }
  }
  throw new AppError('FORBIDDEN', 'NOT_MEMBER', 'Bạn không còn ở nhà này')
}

/** Chủ nhà của nhà đang dùng. Nhà đã lưu trữ chỉ đọc nên cũng bị chặn ở đây. */
export async function requireOwner(db: Db, actor: Actor, houseId: string): Promise<Member> {
  const member = await requireMember(db, actor, houseId)
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'NOT_OWNER', 'Chỉ chủ nhà được thực hiện thao tác này')
  const [house] = await db.select({ archivedAt: houses.archivedAt }).from(houses).where(eq(houses.id, houseId)).limit(1)
  if (!house || house.archivedAt) throw new AppError('FORBIDDEN', 'HOUSE_ARCHIVED', 'Nhà đã được lưu trữ, chỉ xem được')
  return member
}

export type HousePatch = {
  name?: string
  dueDay?: number
  bankBin?: string | null
  bankAccountNo?: string | null
  bankAccountName?: string | null
}

function cleanBank(value: string | null, label: string, pattern: RegExp): string | null {
  if (value === null) return null
  const v = value.trim()
  if (v === '') return null
  if (!pattern.test(v)) throw new AppError('INVALID', 'BANK_FIELD', `${label} không hợp lệ`)
  return v
}

export async function updateHouse(db: Db, actor: Actor, houseId: string, patch: HousePatch): Promise<void> {
  await requireOwner(db, actor, houseId)
  const set: Partial<typeof houses.$inferInsert> = {}
  if (patch.name !== undefined) set.name = cleanName(patch.name)
  if (patch.dueDay !== undefined) {
    if (!Number.isInteger(patch.dueDay) || patch.dueDay < DUE_DAY_MIN || patch.dueDay > DUE_DAY_MAX) {
      throw new AppError('INVALID', 'DUE_DAY', `Hạn đóng là ngày từ ${DUE_DAY_MIN} đến ${DUE_DAY_MAX} trong tháng`)
    }
    set.dueDay = patch.dueDay
  }
  if (patch.bankBin !== undefined) set.bankBin = cleanBank(patch.bankBin, 'Mã ngân hàng', /^\d{6}$/)
  if (patch.bankAccountNo !== undefined) set.bankAccountNo = cleanBank(patch.bankAccountNo, 'Số tài khoản', ACCOUNT_NO_PATTERN)
  if (patch.bankAccountName !== undefined) {
    set.bankAccountName = cleanBank(patch.bankAccountName, 'Tên chủ tài khoản', /^.{1,100}$/)
  }
  if (Object.keys(set).length === 0) return
  await db.update(houses).set(set).where(eq(houses.id, houseId))
}

/**
 * "Xóa nhà" thực chất là lưu trữ (đặt archivedAt). Còn tháng đã chốt chưa thu đủ thì chặn,
 * trừ khi chủ nhà xác nhận lần hai bằng `force`.
 */
export async function archiveHouse(db: Db, actor: Actor, houseId: string, opts: { force?: boolean } = {}): Promise<void> {
  await requireOwner(db, actor, houseId)
  if (!opts.force && (await hasOutstandingBalance(db, houseId))) {
    throw new AppError('CONFLICT', 'UNPAID_PERIODS', 'Nhà còn tháng đã chốt chưa thu đủ. Xác nhận lần nữa để vẫn lưu trữ nhà')
  }
  await db.update(houses).set({ archivedAt: new Date() }).where(eq(houses.id, houseId))
}

/**
 * Các nhà của người dùng: nhà đang dùng trước; sau đó nhà đã lưu trữ và nhà đã rời (`former`, chỉ xem lịch sử);
 * mỗi nhóm theo tên. Rời rồi vào lại thì nhà chỉ xuất hiện một lần, là nhà đang ở.
 */
export async function listMyHouses(db: Db, actor: Actor): Promise<HouseSummary[]> {
  const rows = await db
    .select({ houseId: houses.id, name: houses.name, role: houseMembers.role, archivedAt: houses.archivedAt, leftAt: houseMembers.leftAt })
    .from(houseMembers)
    .innerJoin(houses, eq(houses.id, houseMembers.houseId))
    .where(eq(houseMembers.userId, actor.userId))
  const byHouse = new Map<string, HouseSummary>()
  for (const r of rows) {
    const former = r.leftAt !== null
    if (former && byHouse.has(r.houseId)) continue
    byHouse.set(r.houseId, { houseId: r.houseId, name: r.name, role: r.role, archived: r.archivedAt !== null, former })
  }
  const readOnly = (h: HouseSummary) => Number(h.archived || h.former)
  return [...byHouse.values()].sort((a, b) => readOnly(a) - readOnly(b) || a.name.localeCompare(b.name, 'vi'))
}

export async function listMembers(db: Db, actor: Actor, houseId: string): Promise<Member[]> {
  await requireMember(db, actor, houseId)
  return db
    .select(memberColumns)
    .from(houseMembers)
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(and(eq(houseMembers.houseId, houseId), isNull(houseMembers.leftAt)))
    .orderBy(asc(houseMembers.sortOrder), asc(houseMembers.joinedAt))
}

/**
 * Hạt giống ảnh đại diện (tên hiện tại + số lần "Tạo hình mới") của MỌI người từng ở trong nhà, kể cả người đã rời,
 * theo id thành viên. Các màn lấy tên từ bản chụp của tháng dùng bảng này để vẽ đúng ảnh mà người đó đã chọn.
 * Người đã rời cũng đọc được (họ vẫn xem lại các tháng đã chốt).
 */
export async function listAvatarSeeds(db: Db, actor: Actor, houseId: string): Promise<Record<string, string>> {
  await requireViewer(db, actor, houseId)
  const rows = await db
    .select({ id: houseMembers.id, name: user.name, avatarVariant: user.avatarVariant })
    .from(houseMembers)
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(eq(houseMembers.houseId, houseId))
  return Object.fromEntries(rows.map((r) => [r.id, avatarSeed(r.name, r.avatarVariant)]))
}

/** Vi phạm ràng buộc duy nhất của Postgres (23505); drizzle bọc lỗi gốc trong `cause`. */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && typeof cur === 'object' && depth < 4; depth++) {
    if ((cur as { code?: unknown }).code === '23505') return true
    cur = (cur as { cause?: unknown }).cause
  }
  return false
}

/**
 * Thêm một người vào nhà trong transaction của người gọi (không kiểm quyền: người gọi phải kiểm).
 * Khóa dòng nhà (`FOR NO KEY UPDATE`) trước khi tính sortOrder = lớn nhất + 1, nên nhiều người vào cùng lúc được xếp tuần tự;
 * khóa này cũng làm việc kiểm tra "nhà đã lưu trữ" không lọt qua khi chủ nhà vừa lưu trữ. Dùng NO KEY UPDATE (không phải
 * FOR UPDATE) để không chặn khóa KEY SHARE của các lệnh chèn có khóa ngoại tới nhà (xem thứ tự khóa trong periods.ts).
 * Chỉ mục duy nhất (nhà, người dùng đang ở) vẫn là chốt chặn cuối: vi phạm → ALREADY_MEMBER.
 * Người mới được thêm vào mọi tháng nháp của nhà (đủ số ngày của tháng); tháng đã chốt giữ nguyên.
 */
export async function addMemberTx(tx: Tx, houseId: string, userId: string): Promise<Member> {
  const [house] = await tx
    .select({ archivedAt: houses.archivedAt })
    .from(houses)
    .where(eq(houses.id, houseId))
    .for('no key update')
    .limit(1)
  if (!house) throw new AppError('NOT_FOUND', 'HOUSE_NOT_FOUND', 'Không tìm thấy nhà')
  if (house.archivedAt) throw new AppError('FORBIDDEN', 'HOUSE_ARCHIVED', 'Nhà đã được lưu trữ, không thêm thành viên được')
  const [target] = await tx.select({ name: user.name, avatarVariant: user.avatarVariant }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) throw new AppError('NOT_FOUND', 'USER_NOT_FOUND', 'Không tìm thấy người dùng')
  const [already] = await tx
    .select({ id: houseMembers.id })
    .from(houseMembers)
    .where(and(eq(houseMembers.houseId, houseId), eq(houseMembers.userId, userId), isNull(houseMembers.leftAt)))
    .limit(1)
  if (already) throw new AppError('CONFLICT', 'ALREADY_MEMBER', 'Người này đã ở trong nhà')
  const [last] = await tx
    .select({ sortOrder: houseMembers.sortOrder })
    .from(houseMembers)
    .where(eq(houseMembers.houseId, houseId))
    .orderBy(desc(houseMembers.sortOrder))
    .limit(1)
  let row: typeof houseMembers.$inferSelect
  try {
    const inserted = await tx
      .insert(houseMembers)
      .values({ id: newId(), houseId, userId, role: 'member', sortOrder: (last?.sortOrder ?? -1) + 1 })
      .returning()
    row = inserted[0]
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('CONFLICT', 'ALREADY_MEMBER', 'Người này đã ở trong nhà')
    throw e
  }
  await addMemberToDraftsTx(tx, houseId, row.id)
  return { id: row.id, houseId, userId, role: 'member', sortOrder: row.sortOrder, displayName: target.name, avatarVariant: target.avatarVariant, leftAt: null }
}

/** Chủ nhà cho một thành viên rời nhà (đặt leftAt, giữ dòng để lịch sử các tháng đã chốt còn nguyên). */
export async function removeMember(db: Db, actor: Actor, houseId: string, memberId: string): Promise<void> {
  await requireOwner(db, actor, houseId)
  const [target] = await db
    .select({ id: houseMembers.id, role: houseMembers.role })
    .from(houseMembers)
    .where(and(eq(houseMembers.id, memberId), eq(houseMembers.houseId, houseId), isNull(houseMembers.leftAt)))
    .limit(1)
  if (!target) throw new AppError('NOT_FOUND', 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên')
  if (target.role === 'owner') throw new AppError('CONFLICT', 'CANNOT_REMOVE_OWNER', 'Không thể xóa chủ nhà')
  await db.update(houseMembers).set({ leftAt: new Date() }).where(eq(houseMembers.id, memberId))
}

/** Thành viên tự rời nhà. Chủ nhà không được rời; còn nợ (hoặc còn được chủ nhà trả lại) ở tháng đã chốt thì chưa rời được. */
export async function leaveHouse(db: Db, actor: Actor, houseId: string): Promise<void> {
  const me = await requireMember(db, actor, houseId)
  if (me.role === 'owner') {
    throw new AppError('CONFLICT', 'OWNER_CANNOT_LEAVE', 'Chủ nhà không thể rời nhà. Hãy lưu trữ nhà nếu không dùng nữa')
  }
  if (await hasOutstandingBalance(db, houseId, me.id)) {
    throw new AppError('CONFLICT', 'HAS_BALANCE', 'Bạn còn khoản chưa thanh toán xong ở tháng đã chốt nên chưa rời nhà được')
  }
  await db.update(houseMembers).set({ leftAt: new Date() }).where(eq(houseMembers.id, me.id))
}

export type HouseInfo = {
  id: string
  name: string
  code: string
  dueDay: number
  bankBin: string | null
  bankAccountNo: string | null
  bankAccountName: string | null
  archived: boolean
}

/** Thông tin nhà cho thành viên (kể cả nhà đã lưu trữ) và người đã rời (chỉ đọc: tài khoản ngân hàng để trả phần còn nợ). */
export async function getHouse(db: Db, actor: Actor, houseId: string): Promise<HouseInfo> {
  await requireViewer(db, actor, houseId)
  const [h] = await db.select().from(houses).where(eq(houses.id, houseId)).limit(1)
  if (!h) throw new AppError('NOT_FOUND', 'HOUSE_NOT_FOUND', 'Không tìm thấy nhà')
  return {
    id: h.id,
    name: h.name,
    code: h.code,
    dueDay: h.dueDay,
    bankBin: h.bankBin,
    bankAccountNo: h.bankAccountNo,
    bankAccountName: h.bankAccountName,
    archived: h.archivedAt !== null,
  }
}
