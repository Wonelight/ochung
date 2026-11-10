import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { AppError } from '@/lib/errors'

export type Actor = { userId: string; role: 'admin' | 'user' }

type SessionUser = {
  id: string
  role?: string | null
  banned?: boolean | null
  banExpires?: Date | null
  mustChangePassword?: boolean | null
}

/** Chuyển user của session thành Actor; chặn tài khoản đang bị khóa hoặc chưa đổi mật khẩu tạm. Tách riêng để test không cần request. */
export function actorFromUser(user: SessionUser, now: Date = new Date()): Actor {
  const banActive = user.banned === true && (!user.banExpires || user.banExpires > now)
  if (banActive) throw new AppError('FORBIDDEN', 'BANNED', 'Tài khoản đã bị khóa')
  // layout guard không chạy với hành động server gọi thẳng, nên chặn ở đây cho mọi hàm ghi
  if (user.mustChangePassword === true) {
    throw new AppError('FORBIDDEN', 'MUST_CHANGE_PASSWORD', 'Bạn cần đổi mật khẩu trước khi tiếp tục')
  }
  return { userId: user.id, role: user.role === 'admin' ? 'admin' : 'user' }
}

/** Đọc session Better Auth từ cookie của request hiện tại. */
export async function getActor(): Promise<Actor> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new AppError('FORBIDDEN', 'NO_SESSION', 'Bạn cần đăng nhập')
  return actorFromUser(session.user)
}
