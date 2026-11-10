'use client'

import { usePathname } from 'next/navigation'
import { DioneBar } from './DioneBar'

/** Thanh dưới cố định + lớp mờ phía trên (chép từ mockup: cao 150px, thanh cách đáy 14px). Tab đang chọn theo đường dẫn. */
export function AppNav({ showCreate }: { showCreate: boolean }) {
  const path = usePathname()
  const settings = path === '/cai-dat' || path.startsWith('/cai-dat/') || path === '/nha' || path.startsWith('/nha/')
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[150px] bg-[linear-gradient(to_bottom,var(--c-fade0),var(--c-bg)_62%)]"
      />
      <nav
        aria-label="Điều hướng chính"
        className="fixed bottom-[max(14px,env(safe-area-inset-bottom))] left-1/2 z-20 h-24 w-[390px] -translate-x-1/2"
      >
        <DioneBar active={settings ? 'settings' : 'home'} showCreate={showCreate} />
      </nav>
    </>
  )
}
