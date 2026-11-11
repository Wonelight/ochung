'use client'

import { usePathname } from 'next/navigation'
import { DioneBar } from './DioneBar'

/**
 * Thanh dưới cố định + lớp mờ phía trên (chép từ mockup: cao 150px, thanh cách đáy 14px). Tab đang chọn theo đường dẫn.
 * Lớp mờ có cùng độ rộng với cột nội dung của layout (430px, từ 768px là 560px) nên không tràn ra nền hai bên; thanh Dione 390px
 * luôn ở giữa cột. Thân thanh rộng 358px (từ x=16 đến x=374) nên vừa khít màn 360px; dưới 358px thu nhỏ một chút cho khỏi bị cắt.
 */
export function AppNav({ showCreate }: { showCreate: boolean }) {
  const path = usePathname()
  const settings = path === '/cai-dat' || path.startsWith('/cai-dat/') || path === '/nha' || path.startsWith('/nha/')
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 left-1/2 z-10 h-[150px] w-full max-w-[430px] -translate-x-1/2 bg-[linear-gradient(to_bottom,var(--c-fade0),var(--c-bg)_62%)] md:max-w-[560px]"
      />
      <nav
        aria-label="Điều hướng chính"
        className="fixed bottom-[max(14px,env(safe-area-inset-bottom))] left-1/2 z-20 h-24 w-[390px] -translate-x-1/2 origin-bottom max-[357px]:scale-[0.88]"
      >
        <DioneBar active={settings ? 'settings' : 'home'} showCreate={showCreate} />
      </nav>
    </>
  )
}
