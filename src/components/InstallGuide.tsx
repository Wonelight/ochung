'use client'

import { useState, useSyncExternalStore } from 'react'
import { isIOS, isStandalone } from '@/lib/pwa-env'
import { dismissInstallGuideAction } from '@/app/(app)/_lib/install-guide-actions'

const subscribe = () => () => {}
const showOnClient = () => isIOS() && !isStandalone()

/**
 * Hướng dẫn "Thêm vào Màn hình chính": chỉ hiện trên iOS khi chưa mở từ biểu tượng trên Màn hình chính
 * (thông báo đẩy trên iPhone chỉ hoạt động khi đã thêm). Không có mockup: dùng thẻ như danh sách Hóa đơn / Quản lý nhà.
 * `dismissible` (Trang chủ): có nút X; bấm là ẩn ngay và ghi nhớ bằng cookie nên không hiện lại. Cài đặt không có nút X.
 */
export function InstallGuide({ dismissible = false }: { dismissible?: boolean }) {
  const show = useSyncExternalStore(subscribe, showOnClient, () => false)
  const [closed, setClosed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  if (!show || closed) return null

  function close() {
    setClosed(true)
    void dismissInstallGuideAction().catch(() => {}) // ẩn ngay; nếu mạng lỗi thì lần sau vẫn hiện lại
  }

  const closeButton = (
    <button
      type="button"
      aria-label="Đóng hướng dẫn"
      onClick={close}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )

  // Trang chủ: mặc định chỉ một dòng gọn (không đẩy nội dung xuống ~230px), bấm "Xem cách" mới mở các bước
  if (dismissible && !expanded) {
    return (
      <section aria-label="Thêm vào Màn hình chính" className="flex items-center gap-1 rounded-[20px] border border-line bg-surface py-0.5 pl-3.5 pr-0.5">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Thêm vào Màn hình chính</span>
        <button type="button" onClick={() => setExpanded(true)} className="h-11 shrink-0 cursor-pointer border-0 bg-transparent px-2 font-[inherit] text-[14px] font-semibold text-accent-text">
          Xem cách
        </button>
        {closeButton}
      </section>
    )
  }

  return (
    <section aria-label="Thêm vào Màn hình chính" className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-semibold">Thêm vào Màn hình chính</h2>
        {dismissible && <span className="-mr-2 -mt-1.5">{closeButton}</span>}
      </div>
      <p className="m-0 text-[13px] leading-snug text-muted">Để mở app nhanh như app thường và nhận thông báo hóa đơn trên iPhone:</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        <Step n={1}>
          Mở trang này bằng Safari, bấm nút <strong className="font-semibold">Chia sẻ</strong>
          <svg className="mx-1 inline-block align-[-3px]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m8 7 4-4 4 4" />
            <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
          </svg>
          ở thanh dưới.
        </Step>
        <Step n={2}>
          Chọn <strong className="font-semibold">Thêm vào MH chính</strong>, rồi bấm <strong className="font-semibold">Thêm</strong>.
        </Step>
        <Step n={3}>Mở app từ biểu tượng mới trên Màn hình chính, vào Cài đặt để bật thông báo.</Step>
      </ol>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] leading-snug">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-inner text-[12px] font-semibold text-accent-text">{n}</span>
      <span className="min-w-0 pt-0.5">{children}</span>
    </li>
  )
}
