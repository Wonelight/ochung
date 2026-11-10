import { AppNav } from '@/components/AppNav'
import { getHouseContext } from '@/server/current-house'
import { guardRoute } from '@/server/guard'

// Khung các trang cần đăng nhập: guard luôn chạy đầu tiên, thanh dưới Dione khi đã có nhà.
// Bắt buộc có nhà do từng trang đảm nhiệm (requireCurrentHouse): layout luôn render children.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await guardRoute()
  const { current } = await getHouseContext()

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-bg text-text">
      {children}
      {current && <AppNav showCreate={current.role === 'owner' && !current.archived} />}
    </div>
  )
}
