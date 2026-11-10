import { randomInt } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { account, session, user } from '@/db/schema'
import { auth as defaultAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'

/** Instance Better Auth dùng cho các hàm này; mặc định là `auth` thật, test truyền instance trên PGlite. */
type AuthInstance = typeof defaultAuth

const MAX_ACCOUNT_CODE_ATTEMPTS = 20
const USERNAME_PATTERN = /^[a-z0-9_.]{2,30}$/
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
// bỏ các ký tự dễ nhầm khi đọc/đọc cho người khác chép: I l 1 O 0
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'NOT_ADMIN', 'Chỉ quản trị viên được thực hiện thao tác này')
}

function checkPassword(password: string) {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new AppError('INVALID', 'PASSWORD_LENGTH', `Mật khẩu phải từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự`)
  }
}

/** Mã tài khoản `U-` + 5 chữ số, thử lại khi trùng (tối đa 20 lần). */
export async function generateAccountCode(exists: (code: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < MAX_ACCOUNT_CODE_ATTEMPTS; attempt++) {
    const code = `U-${String(randomInt(1, 100_000)).padStart(5, '0')}`
    if (!(await exists(code))) return code
  }
  throw new Error('Không sinh được mã tài khoản chưa dùng sau nhiều lần thử')
}

/** Mật khẩu tạm 10 ký tự ngẫu nhiên (CSPRNG) để quản trị viên đọc cho thành viên. */
export function generateTempPassword(length = 10): string {
  let out = ''
  for (let i = 0; i < length; i++) out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]
  return out
}

export async function adminCreateUser(
  db: Db,
  actor: Actor,
  input: { username: string; displayName: string; tempPassword: string },
  authInstance: AuthInstance = defaultAuth,
): Promise<{ userId: string; accountCode: string }> {
  requireAdmin(actor)
  const username = input.username.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError('INVALID', 'USERNAME_FORMAT', 'Tên đăng nhập gồm 2–30 ký tự: chữ không dấu, số, dấu chấm hoặc gạch dưới')
  }
  if (displayName.length < 1 || displayName.length > 50) {
    throw new AppError('INVALID', 'DISPLAY_NAME', 'Tên hiển thị gồm 1–50 ký tự')
  }
  checkPassword(input.tempPassword)

  const taken = await db.select({ id: user.id }).from(user).where(eq(user.username, username)).limit(1)
  if (taken.length > 0) throw new AppError('CONFLICT', 'USERNAME_TAKEN', 'Tên đăng nhập đã được dùng')

  const accountCode = await generateAccountCode(
    async (code) => (await db.select({ id: user.id }).from(user).where(eq(user.accountCode, code)).limit(1)).length > 0,
  )

  try {
    const created = await authInstance.api.createUser({
      body: {
        email: `${username}@nha.local`,
        password: input.tempPassword,
        name: displayName,
        role: 'user',
        data: { username, accountCode, mustChangePassword: true },
      },
    })
    return { userId: created.user.id, accountCode }
  } catch (e) {
    // hai quản trị viên tạo cùng tên gần như cùng lúc: lần kiểm trước bị lọt, ràng buộc unique chặn lại
    const code = (e as { body?: { code?: string } }).body?.code
    if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
      throw new AppError('CONFLICT', 'USERNAME_TAKEN', 'Tên đăng nhập đã được dùng')
    }
    throw e
  }
}

/**
 * Đặt mật khẩu tạm, bắt đổi lại ở lần đăng nhập kế tiếp và thu hồi mọi phiên đang mở của người đó.
 * Ghi thẳng DB: các endpoint set-user-password/ban-user của plugin admin đòi session qua headers
 * của request, trong khi quyền admin ở đây đã được kiểm bằng `actor`.
 */
export async function adminResetPassword(
  db: Db,
  actor: Actor,
  userId: string,
  tempPassword: string,
  authInstance: AuthInstance = defaultAuth,
): Promise<void> {
  requireAdmin(actor)
  checkPassword(tempPassword)
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) throw new AppError('NOT_FOUND', 'USER_NOT_FOUND', 'Không tìm thấy người dùng')

  const hash = await (await authInstance.$context).password.hash(tempPassword)
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(account)
      .set({ password: hash })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      .returning({ id: account.id })
    if (updated.length === 0) {
      // tài khoản chưa có bản ghi đăng nhập bằng mật khẩu (vd chỉ có passkey)
      await tx.insert(account).values({ id: newId(), accountId: userId, providerId: 'credential', userId, password: hash })
    }
    await tx.update(user).set({ mustChangePassword: true }).where(eq(user.id, userId))
    await tx.delete(session).where(eq(session.userId, userId))
  })
}

export async function adminSetBanned(
  db: Db,
  actor: Actor,
  userId: string,
  banned: boolean,
): Promise<void> {
  requireAdmin(actor)
  if (banned && userId === actor.userId) {
    throw new AppError('INVALID', 'CANNOT_BAN_SELF', 'Bạn không thể tự khóa tài khoản của mình')
  }
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) throw new AppError('NOT_FOUND', 'USER_NOT_FOUND', 'Không tìm thấy người dùng')

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set(banned ? { banned: true, banReason: 'Quản trị viên khóa', banExpires: null } : { banned: false, banReason: null, banExpires: null })
      .where(eq(user.id, userId))
    if (banned) await tx.delete(session).where(eq(session.userId, userId))
  })
}

export type AdminUserRow = {
  id: string
  username: string | null
  displayName: string
  accountCode: string
  banned: boolean
  role: string | null
  createdAt: Date
}

export async function adminListUsers(db: Db, actor: Actor): Promise<AdminUserRow[]> {
  requireAdmin(actor)
  const rows = await db
    .select({
      id: user.id,
      username: user.username,
      displayName: user.name,
      accountCode: user.accountCode,
      banned: user.banned,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
  return rows.map((r) => ({ ...r, banned: r.banned === true }))
}
