import type { Metadata } from 'next'
import Link from 'next/link'
import { safeNext } from '@/lib/route-guard'
import { guardRoute } from '@/server/guard'
import { AuthHero } from '../_ui/auth-hero'
import { ChangePasswordForm } from './change-password-form'

export const metadata: Metadata = { title: 'Đổi mật khẩu — Chi tiêu nhà' }

// Một trang cho hai lối vào: bắt buộc ở lần đăng nhập đầu (mật khẩu tạm) và tự nguyện từ Cài đặt > Đổi mật khẩu.
export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const user = await guardRoute()
  const forced = user?.mustChangePassword === true
  // `next`: link mời đang mở dở ở lần đăng nhập đầu (routeGuard gắn vào); lọc bằng safeNext như trang đăng nhập
  const { next } = await searchParams
  return (
    <>
      <AuthHero subtitle={forced ? 'Lần đầu đăng nhập — hãy đặt mật khẩu riêng của bạn' : 'Đặt mật khẩu mới cho tài khoản của bạn'} />
      <ChangePasswordForm forced={forced} next={safeNext(typeof next === 'string' ? next : null)} />
      <div className="mt-auto flex flex-col items-center gap-3 px-6 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
        {forced ? (
          <p className="m-0 text-center text-[13px] text-muted">Mật khẩu tạm do quản trị viên cấp chỉ dùng được một lần.</p>
        ) : (
          <Link href="/cai-dat" className="flex h-11 items-center px-4 text-[14px] font-semibold text-muted no-underline">
            Quay lại Cài đặt
          </Link>
        )}
      </div>
    </>
  )
}
