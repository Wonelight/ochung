import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { user } from '@/db/schema'
import { auth as defaultAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'

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
