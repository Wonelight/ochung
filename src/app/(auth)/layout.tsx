import { guardRoute } from '@/server/guard'

// Khung màn Đăng nhập / Đổi mật khẩu (mockup 390×844). Người đã đăng nhập bị chuyển đi.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await guardRoute()
  return <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg text-text">{children}</main>
}
