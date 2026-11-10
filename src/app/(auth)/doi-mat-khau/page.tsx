import type { Metadata } from 'next'
import { AuthHero } from '../_ui/auth-hero'
import { ChangePasswordForm } from './change-password-form'

export const metadata: Metadata = { title: 'Đổi mật khẩu — Chi tiêu nhà' }

export default function ChangePasswordPage() {
  return (
    <>
      <AuthHero subtitle="Lần đầu đăng nhập — hãy đặt mật khẩu riêng của bạn" />
      <ChangePasswordForm />
      <div className="mt-auto px-6 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
        <p className="m-0 text-center text-[13px] text-muted">Mật khẩu tạm do quản trị viên cấp chỉ dùng được một lần.</p>
      </div>
    </>
  )
}
