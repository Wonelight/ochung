import { headers } from 'next/headers'
import { AppNav } from '@/components/AppNav'
import { RedirectTo } from '@/components/RedirectTo'
import { getHouseContext } from '@/server/current-house'
import { guardRoute } from '@/server/guard'

// Khung các trang cần đăng nhập: chặn theo phiên (guard luôn chạy đầu tiên), bắt có nhà, thanh dưới Dione.
// Chuyển hướng "chưa có nhà" chỉ chạy khi layout được dựng lại (tải trang, sau hành động đã revalidate '/', 'layout').
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await guardRoute()
  const { current } = await getHouseContext()
  const path = (await headers()).get('x-pathname') ?? '/'
  // Task 9 đổi đích này sang /vao-nha
  if (!current && path !== '/nha/moi') return <RedirectTo href="/nha/moi" />

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-bg text-text">
      {children}
      {current && <AppNav showCreate={current.role === 'owner' && !current.archived} />}
    </div>
  )
}
