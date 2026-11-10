import type { Metadata } from 'next'
import { safeNext } from '@/lib/route-guard'
import { AuthHero } from '../_ui/auth-hero'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Đăng nhập — Chi tiêu nhà' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  return (
    <>
      <AuthHero subtitle="Điện, nước, dịch vụ — chia gọn mỗi tháng" />
      <LoginForm next={safeNext(typeof next === 'string' ? next : null)} />
      <div className="mt-auto flex flex-col items-center gap-1 px-6 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
        <p className="m-0 text-center text-[13px] text-muted">Tài khoản do quản trị viên cấp.</p>
        <p className="m-0 text-center text-[13px] text-muted">Chưa có tài khoản? Liên hệ quản trị viên.</p>
      </div>
    </>
  )
}
