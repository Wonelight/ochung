import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthHero } from '../_ui/auth-hero'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Quên mật khẩu — Chi tiêu nhà' }

// Công khai (routeGuard cho vào khi chưa đăng nhập). Ba bước ngay trên một trang: email → mã 6 số + mật khẩu mới → xong.
export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHero />
      <ForgotPasswordForm />
      <div className="mt-auto flex flex-col items-center gap-3 px-6 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
        <Link href="/login?form" className="flex h-11 items-center px-4 text-[14px] font-semibold text-muted no-underline">
          Quay lại đăng nhập
        </Link>
      </div>
    </>
  )
}
