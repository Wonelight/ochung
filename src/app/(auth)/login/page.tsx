import type { Metadata } from 'next'
import { googleEnabled } from '@/lib/google-env'
import { safeNext } from '@/lib/route-guard'
import { LoginExperience } from './_ui/login-experience'

const DESCRIPTION = 'Chia tiền nhà mỗi tháng, rõ từng đồng, cả nhà cùng thấy.'

export const metadata: Metadata = {
  title: 'Đăng nhập — Chi tiêu nhà',
  description: DESCRIPTION,
  openGraph: { title: 'Chi tiêu nhà', description: DESCRIPTION, locale: 'vi_VN', type: 'website' },
}

// Màn chào kiêm đăng nhập. Có `next` (link mời, đăng nhập lại) hoặc `?form` (chạm island trước khi trang chạy JavaScript)
// thì vào thẳng form: người đó đang cần đăng nhập, không cần xem màn chào.
// `error`: mã lỗi Better Auth gắn vào khi đăng nhập Google hỏng giữa chừng (người dùng hủy, email chưa liên kết...).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; form?: string | string[]; error?: string | string[] }>
}) {
  const { next, form, error } = await searchParams
  const nextPath = typeof next === 'string' ? next : null
  const oauthError = typeof error === 'string' ? error.slice(0, 64) : null
  return (
    <LoginExperience
      next={safeNext(nextPath)}
      startOpen={nextPath !== null || form !== undefined || oauthError !== null}
      googleEnabled={googleEnabled()}
      oauthError={oauthError}
    />
  )
}
