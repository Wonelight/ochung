import { randomInt } from 'node:crypto'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { houseMembers, houses, user, utilityTariffs } from '@/db/schema'
import type { Tariff } from '@/lib/billing/types'
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
  leftAt: Date | null
}

export type HouseSummary = { houseId: string; name: string; role: 'owner' | 'member'; archived: boolean }

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

/** Các nhà người dùng đang là thành viên: nhà đang dùng trước, nhà đã lưu trữ sau, mỗi nhóm theo tên. */
export async function listMyHouses(db: Db, actor: Actor): Promise<HouseSummary[]> {
  const rows = await db
    .select({ houseId: houses.id, name: houses.name, role: houseMembers.role, archivedAt: houses.archivedAt })
    .from(houseMembers)
    .innerJoin(houses, eq(houses.id, houseMembers.houseId))
    .where(and(eq(houseMembers.userId, actor.userId), isNull(houseMembers.leftAt)))
  return rows
    .map(({ archivedAt, ...r }) => ({ ...r, archived: archivedAt !== null }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'vi'))
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
  const [target] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1)
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
  return { id: row.id, houseId, userId, role: 'member', sortOrder: row.sortOrder, displayName: target.name, leftAt: null }
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

/** Thông tin nhà cho thành viên (kể cả nhà đã lưu trữ). */
export async function getHouse(db: Db, actor: Actor, houseId: string): Promise<HouseInfo> {
  await requireMember(db, actor, houseId)
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
