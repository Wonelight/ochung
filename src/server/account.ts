import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { account, user } from '@/db/schema'
import { isPlaceholderEmail } from '@/lib/account-rules'
import { auth as defaultAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { todayVn } from '@/lib/vn-time'
import type { Actor } from './actor'

const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

/**
 * Người dùng tự đổi mật khẩu (dùng cho lần đăng nhập đầu, khi `mustChangePassword` đang bật).
 * Cờ chỉ được tắt SAU KHI Better Auth đã kiểm mật khẩu hiện tại và ghi mật khẩu mới,
 * nên không thể bỏ qua bước đổi bằng cách gọi thẳng hành động này.
 * `headers` là header của request (cookie phiên); các phiên khác của người đó bị thu hồi.
 */
export async function changeOwnPassword(
  db: Db,
  headers: Headers,
  input: { currentPassword: string; newPassword: string },
  authInstance: typeof defaultAuth = defaultAuth,
): Promise<void> {
  if (input.newPassword.length < PASSWORD_MIN || input.newPassword.length > PASSWORD_MAX) {
    throw new AppError('INVALID', 'PASSWORD_LENGTH', `Mật khẩu mới phải từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự`)
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError('INVALID', 'PASSWORD_UNCHANGED', 'Mật khẩu mới phải khác mật khẩu hiện tại')
  }
  const current = await authInstance.api.getSession({ headers })
  if (!current) throw new AppError('FORBIDDEN', 'NO_SESSION', 'Bạn cần đăng nhập')

  try {
    await authInstance.api.changePassword({
      headers,
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
    })
  } catch (e) {
    const code = (e as { body?: { code?: string } }).body?.code
    if (code === 'INVALID_PASSWORD') {
      throw new AppError('INVALID', 'WRONG_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng')
    }
    throw e
  }
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, current.user.id))
}

const DISPLAY_NAME_MAX = 50
const DOB_MIN = '1900-01-01'

export type OwnProfile = {
  name: string
  /** YYYY-MM-DD hoặc null. */
  dob: string | null
  accountCode: string
  avatarVariant: number
}

/** Hồ sơ của chính actor (tên hiển thị, ngày sinh, mã tài khoản, số lần "Tạo hình mới"). */
export async function readOwnProfile(db: Db, actor: Actor): Promise<OwnProfile> {
  const [row] = await db
    .select({ name: user.name, dob: user.dob, accountCode: user.accountCode, avatarVariant: user.avatarVariant })
    .from(user)
    .where(eq(user.id, actor.userId))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'NO_USER', 'Không tìm thấy tài khoản')
  return { ...row, dob: row.dob ? row.dob.toISOString().slice(0, 10) : null }
}

export type LoginMethods = {
  /** Có mật khẩu (tài khoản đăng ký bằng tên đăng nhập hoặc do quản trị viên cấp). Tài khoản chỉ có Google thì không. */
  hasPassword: boolean
  googleLinked: boolean
  /** Email thật dùng để khôi phục mật khẩu; null khi tài khoản chỉ có email giả của quản trị viên cấp. */
  email: string | null
}

/** Cách đăng nhập của chính người dùng: Cài đặt dựa vào đây để ẩn "Đổi mật khẩu" và hiện "Liên kết Google". */
export async function readLoginMethods(db: Db, actor: Actor): Promise<LoginMethods> {
  const rows = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, actor.userId))
  const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, actor.userId)).limit(1)
  return {
    hasPassword: rows.some((r) => r.providerId === 'credential'),
    googleLinked: rows.some((r) => r.providerId === 'google'),
    email: owner && !isPlaceholderEmail(owner.email) ? owner.email : null,
  }
}

/** YYYY-MM-DD hợp lệ (ngày có thật trên lịch), từ 1900 đến hôm nay theo giờ Việt Nam. */
function parseDob(dob: string, now: Date): Date {
  const invalid = () => new AppError('INVALID', 'DOB_INVALID', 'Ngày sinh không hợp lệ hoặc ở tương lai')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw invalid()
  const date = new Date(`${dob}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dob) throw invalid()
  if (dob < DOB_MIN || dob > todayVn(now)) throw invalid()
  return date
}

/**
 * Người dùng tự sửa tên hiển thị (1..50 ký tự) và ngày sinh (rỗng = xóa). Chỉ ghi hai cột này cho đúng actor:
 * vai trò, mã tài khoản, tên đăng nhập không bao giờ đổi được từ đây dù input có thêm trường.
 */
export async function updateOwnProfile(
  db: Db,
  actor: Actor,
  input: { name: string; dob: string },
  now: Date = new Date(),
): Promise<void> {
  const name = String(input.name ?? '').trim()
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX) {
    throw new AppError('INVALID', 'NAME_LENGTH', `Tên hiển thị phải từ 1 đến ${DISPLAY_NAME_MAX} ký tự`)
  }
  const dobText = String(input.dob ?? '').trim()
  const dob = dobText === '' ? null : parseDob(dobText, now)
  await db.update(user).set({ name, dob }).where(eq(user.id, actor.userId))
}

/** "Tạo hình mới": avatarVariant + 1 (tăng ngay trong SQL nên hai lần bấm gần nhau không ghi đè nhau). Trả số mới. */
export async function shuffleOwnAvatar(db: Db, actor: Actor): Promise<number> {
  const [row] = await db
    .update(user)
    .set({ avatarVariant: sql`${user.avatarVariant} + 1` })
    .where(eq(user.id, actor.userId))
    .returning({ avatarVariant: user.avatarVariant })
  if (!row) throw new AppError('NOT_FOUND', 'NO_USER', 'Không tìm thấy tài khoản')
  return row.avatarVariant
}
