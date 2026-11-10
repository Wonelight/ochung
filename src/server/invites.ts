import { randomInt } from 'node:crypto'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { houseMembers, houses, inviteLinks, joinRequests, user } from '@/db/schema'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import { addMemberTx, isUniqueViolation, requireOwner, type Member, type Tx } from './houses'
import { afterCommit, notifyJoinDecided, notifyJoinRequested } from './notifications'

const INVITE_DAYS = 7
const TOKEN_LENGTH = 32
// chữ và số: an toàn khi đặt trong đường dẫn URL
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const HOUSE_CODE_SHAPE = /^([A-Z]{2})([A-Z0-9]{4})$/

function generateToken(): string {
  let token = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]
  return token
}

function inviteUrl(token: string): string {
  const base = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/moi/${token}`
}

/** Mã người dùng gõ: bỏ mọi khoảng trắng, viết hoa. */
function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** Mã nhà `XX-XXXX`; gõ liền không dấu gạch (`CG7K2Q`) vẫn nhận. */
function normalizeHouseCode(raw: string): string {
  const code = normalizeCode(raw)
  const m = HOUSE_CODE_SHAPE.exec(code)
  return m ? `${m[1]}-${m[2]}` : code
}

async function isActiveMember(db: Db | Tx, houseId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: houseMembers.id })
    .from(houseMembers)
    .where(and(eq(houseMembers.houseId, houseId), eq(houseMembers.userId, userId), isNull(houseMembers.leftAt)))
    .limit(1)
  return rows.length > 0
}

/** Đóng yêu cầu chờ duyệt (nếu có) của người vừa vào nhà bằng đường khác. */
async function settlePendingRequest(tx: Tx, houseId: string, userId: string): Promise<void> {
  await tx
    .update(joinRequests)
    .set({ status: 'approved', decidedAt: new Date() })
    .where(and(eq(joinRequests.houseId, houseId), eq(joinRequests.userId, userId), eq(joinRequests.status, 'pending')))
}

// ───────────────────────── Link mời ─────────────────────────

export async function createInviteLink(
  db: Db,
  actor: Actor,
  houseId: string,
): Promise<{ id: string; token: string; url: string; expiresAt: Date }> {
  await requireOwner(db, actor, houseId)
  const id = newId()
  const token = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(inviteLinks).values({ id, houseId, token, expiresAt, createdBy: actor.userId })
  return { id, token, url: inviteUrl(token), expiresAt }
}

export async function revokeInviteLink(db: Db, actor: Actor, linkId: string): Promise<void> {
  const [link] = await db
    .select({ houseId: inviteLinks.houseId })
    .from(inviteLinks)
    .where(eq(inviteLinks.id, linkId))
    .limit(1)
  if (!link) throw new AppError('NOT_FOUND', 'INVITE_NOT_FOUND', 'Không tìm thấy link mời')
  await requireOwner(db, actor, link.houseId)
  await db
    .update(inviteLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(inviteLinks.id, linkId), isNull(inviteLinks.revokedAt)))
}

/** Mọi link của nhà, mới nhất trước (giao diện chỉ hiện link còn hiệu lực). */
export async function listInviteLinks(
  db: Db,
  actor: Actor,
  houseId: string,
): Promise<{ id: string; url: string; expiresAt: Date; revoked: boolean }[]> {
  await requireOwner(db, actor, houseId)
  const rows = await db
    .select()
    .from(inviteLinks)
    .where(eq(inviteLinks.houseId, houseId))
    .orderBy(desc(inviteLinks.createdAt), desc(inviteLinks.id))
  return rows.map((l) => ({ id: l.id, url: inviteUrl(l.token), expiresAt: l.expiresAt, revoked: l.revokedAt !== null }))
}

function assertLinkUsable(link: { expiresAt: Date; revokedAt: Date | null }): void {
  if (link.revokedAt) throw new AppError('CONFLICT', 'INVITE_REVOKED', 'Chủ nhà đã hủy link mời này')
  if (link.expiresAt.getTime() <= Date.now()) {
    throw new AppError('CONFLICT', 'INVITE_EXPIRED', 'Link mời đã hết hạn, hãy nhờ chủ nhà gửi link mới')
  }
}

/**
 * Vào nhà bằng link mời, không cần duyệt. Link dùng được nhiều lần đến khi hết hạn hoặc bị hủy.
 * Người đã ở trong nhà bấm lại thì chỉ nhận lại houseId (kể cả khi link đã hết hạn).
 * Trạng thái link được đọc lại trong transaction với khóa chia sẻ trên dòng link: lệnh hủy (UPDATE cùng dòng)
 * hoặc đã xong trước khi ta thêm thành viên, hoặc phải chờ ta xong; không có chuyện hủy xong mà vẫn lọt vào nhà.
 * `hooks.afterPrecheck` chỉ để test chen một lệnh hủy vào giữa lần đọc đầu và transaction.
 */
export async function acceptInvite(
  db: Db,
  actor: Actor,
  token: string,
  hooks: { afterPrecheck?: () => Promise<void> } = {},
): Promise<{ houseId: string }> {
  const [link] = await db
    .select({ houseId: inviteLinks.houseId, expiresAt: inviteLinks.expiresAt, revokedAt: inviteLinks.revokedAt })
    .from(inviteLinks)
    .where(eq(inviteLinks.token, token))
    .limit(1)
  if (!link) throw new AppError('NOT_FOUND', 'INVITE_NOT_FOUND', 'Link mời không đúng hoặc đã bị xóa')
  const { houseId } = link
  if (await isActiveMember(db, houseId, actor.userId)) return { houseId }
  assertLinkUsable(link)
  await hooks.afterPrecheck?.()
  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ expiresAt: inviteLinks.expiresAt, revokedAt: inviteLinks.revokedAt })
        .from(inviteLinks)
        .where(eq(inviteLinks.token, token))
        .for('share')
        .limit(1)
      if (!fresh) throw new AppError('NOT_FOUND', 'INVITE_NOT_FOUND', 'Link mời không đúng hoặc đã bị xóa')
      assertLinkUsable(fresh)
      await addMemberTx(tx, houseId, actor.userId) // kiểm nhà đã lưu trữ ở đây, dưới khóa dòng nhà
      await settlePendingRequest(tx, houseId, actor.userId)
    })
  } catch (e) {
    // hai lời gọi cùng lúc của một người: lời gọi đến sau thấy người đó đã vào rồi
    if (e instanceof AppError && e.reason === 'ALREADY_MEMBER') return { houseId }
    throw e
  }
  return { houseId }
}

// ───────────────────────── Mã nhà + chủ nhà duyệt ─────────────────────────

export async function requestJoinByCode(
  db: Db,
  actor: Actor,
  code: string,
): Promise<{ requestId: string; houseName: string }> {
  const [house] = await db
    .select({ id: houses.id, name: houses.name, archivedAt: houses.archivedAt })
    .from(houses)
    .where(eq(houses.code, normalizeHouseCode(code)))
    .limit(1)
  if (!house) throw new AppError('NOT_FOUND', 'HOUSE_CODE_NOT_FOUND', 'Không tìm thấy nhà với mã này. Hãy kiểm tra lại mã với chủ nhà')
  if (house.archivedAt) throw new AppError('FORBIDDEN', 'HOUSE_ARCHIVED', 'Nhà này đã được lưu trữ, không nhận thành viên mới')
  if (await isActiveMember(db, house.id, actor.userId)) {
    throw new AppError('CONFLICT', 'ALREADY_MEMBER', 'Bạn đã ở trong nhà này rồi')
  }
  const pending = new AppError('CONFLICT', 'REQUEST_PENDING', 'Bạn đã gửi yêu cầu vào nhà này, đang chờ chủ nhà duyệt')
  const [existing] = await db
    .select({ id: joinRequests.id })
    .from(joinRequests)
    .where(and(eq(joinRequests.houseId, house.id), eq(joinRequests.userId, actor.userId), eq(joinRequests.status, 'pending')))
    .limit(1)
  if (existing) throw pending
  const requestId = newId()
  try {
    await db.insert(joinRequests).values({ id: requestId, houseId: house.id, userId: actor.userId })
  } catch (e) {
    if (isUniqueViolation(e)) throw pending
    throw e
  }
  await afterCommit('Thông báo xin vào nhà', () => notifyJoinRequested(db, requestId))
  return { requestId, houseName: house.name }
}

/** Các yêu cầu vào nhà đang chờ của chính người dùng (màn Vào nhà). */
export async function listMyJoinRequests(
  db: Db,
  actor: Actor,
): Promise<{ id: string; houseName: string; houseCode: string }[]> {
  return db
    .select({ id: joinRequests.id, houseName: houses.name, houseCode: houses.code })
    .from(joinRequests)
    .innerJoin(houses, eq(houses.id, joinRequests.houseId))
    .where(and(eq(joinRequests.userId, actor.userId), eq(joinRequests.status, 'pending')))
    .orderBy(asc(joinRequests.createdAt))
}

export async function cancelJoinRequest(db: Db, actor: Actor, requestId: string): Promise<void> {
  const [request] = await db
    .select({ userId: joinRequests.userId, status: joinRequests.status })
    .from(joinRequests)
    .where(eq(joinRequests.id, requestId))
    .limit(1)
  // yêu cầu của người khác coi như không tồn tại
  if (!request || request.userId !== actor.userId) {
    throw new AppError('NOT_FOUND', 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu vào nhà')
  }
  const updated = await db
    .update(joinRequests)
    .set({ status: 'cancelled', decidedAt: new Date() })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, 'pending')))
    .returning({ id: joinRequests.id })
  if (updated.length === 0) throw new AppError('CONFLICT', 'REQUEST_NOT_PENDING', 'Yêu cầu này đã được xử lý rồi')
}

export async function listJoinRequests(
  db: Db,
  actor: Actor,
  houseId: string,
): Promise<{ id: string; userId: string; displayName: string; createdAt: Date }[]> {
  await requireOwner(db, actor, houseId)
  return db
    .select({ id: joinRequests.id, userId: joinRequests.userId, displayName: user.name, createdAt: joinRequests.createdAt })
    .from(joinRequests)
    .innerJoin(user, eq(user.id, joinRequests.userId))
    .where(and(eq(joinRequests.houseId, houseId), eq(joinRequests.status, 'pending')))
    .orderBy(asc(joinRequests.createdAt), asc(joinRequests.id))
}

export async function decideJoinRequest(
  db: Db,
  actor: Actor,
  requestId: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  const [request] = await db
    .select({ houseId: joinRequests.houseId, userId: joinRequests.userId })
    .from(joinRequests)
    .where(eq(joinRequests.id, requestId))
    .limit(1)
  if (!request) throw new AppError('NOT_FOUND', 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu vào nhà')
  await requireOwner(db, actor, request.houseId)

  await db.transaction(async (tx) => {
    // chuyển trạng thái có điều kiện: hai lần duyệt cùng lúc thì chỉ một lần thắng
    const claimed = await tx
      .update(joinRequests)
      .set({ status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date() })
      .where(and(eq(joinRequests.id, requestId), eq(joinRequests.status, 'pending')))
      .returning({ id: joinRequests.id })
    if (claimed.length === 0) throw new AppError('CONFLICT', 'REQUEST_NOT_PENDING', 'Yêu cầu này đã được xử lý rồi')
    if (decision === 'reject') return
    try {
      await addMemberTx(tx, request.houseId, request.userId)
    } catch (e) {
      // đã vào bằng link mời hoặc mã tài khoản trong lúc chờ: coi như đã duyệt xong
      if (!(e instanceof AppError && e.reason === 'ALREADY_MEMBER')) throw e
    }
  })
  await afterCommit('Thông báo kết quả xin vào nhà', () => notifyJoinDecided(db, requestId, decision))
}

// ───────────────────────── Mã tài khoản ─────────────────────────

export async function addMemberByAccountCode(
  db: Db,
  actor: Actor,
  houseId: string,
  accountCode: string,
): Promise<Member> {
  await requireOwner(db, actor, houseId)
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.accountCode, normalizeCode(accountCode)))
    .limit(1)
  if (!target) {
    throw new AppError('NOT_FOUND', 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản với mã này. Hãy kiểm tra lại mã người đó gửi')
  }
  return db.transaction(async (tx) => {
    const member = await addMemberTx(tx, houseId, target.id)
    await settlePendingRequest(tx, houseId, target.id)
    return member
  })
}
