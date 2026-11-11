import { AppNav } from '@/components/AppNav'
import { PasskeyPrompt } from '@/components/PasskeyPrompt'
import { getHouseContext } from '@/server/current-house'
import { guardRoute } from '@/server/guard'

// Khung các trang cần đăng nhập: guard luôn chạy đầu tiên, thanh dưới Dione khi đã có nhà.
// Bắt buộc có nhà do từng trang đảm nhiệm (requireCurrentHouse): layout luôn render children.
// Điện thoại: cột 430px. Từ 768px: cột giữa tối đa 560px (nền ngoài cột vẫn là màu nền), thanh Dione nằm đáy cột.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await guardRoute()
  const { actor, current } = await getHouseContext()

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-bg text-text md:max-w-[560px] md:border-x md:border-line">
      {children}
      {current && <AppNav showCreate={current.role === 'owner' && !current.archived} />}
      <PasskeyPrompt userId={actor.userId} />
    </div>
  )
}
