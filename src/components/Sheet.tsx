'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// Tấm trượt từ dưới lên dùng cho Mã QR, từ chối, ghi tiền mặt/trả lại. Không có mockup riêng nên lấy kiểu của tấm
// "Tạo mới" (mockup `Tạo hóa đơn tháng`): nền backdrop, tấm bo 28 phía trên, vạch kéo 36×5, tiêu đề 22/700 + nút đóng 44px,
// chân tấm nền panel viền trên, đệm 14/20/34, nút chính cao 54 bo 27 màu #E8833A có bóng.

export const sheetCtaClass =
  'flex h-[54px] w-full cursor-pointer items-center justify-center rounded-[27px] border-0 bg-accent font-[inherit] text-[17px] font-bold text-[#1A0F06] shadow-[0_8px_24px_rgba(232,131,58,0.28)] disabled:cursor-default disabled:opacity-50'

export function Sheet({
  title,
  onClose,
  busy = false,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  /** Đang gửi: không cho đóng bằng Esc. */
  busy?: boolean
  children: ReactNode
  /** Chân tấm cố định (lỗi + nút chính). */
  footer: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--c-create-backdrop)]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border-t border-line bg-[var(--c-create-sheet)] shadow-[0_-10px_50px_var(--c-create-glow)] outline-none"
      >
        <div aria-hidden="true" className="mt-2 h-[5px] w-9 shrink-0 self-center rounded-[3px] bg-line2" />
        <div className="flex shrink-0 items-center justify-between px-5 pt-2.5">
          <h1 className="m-0 text-[22px] font-bold">{title}</h1>
          <button
            type="button"
            aria-label="Đóng"
            disabled={busy}
            onClick={onClose}
            className="flex size-11 cursor-pointer items-center justify-center rounded-[22px] border border-line bg-[var(--c-create-panel)] p-0 text-text disabled:cursor-default disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 pt-3">{children}</div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-line bg-[var(--c-create-panel)] px-5 pb-[max(34px,env(safe-area-inset-bottom))] pt-3.5">
          {footer}
        </div>
      </div>
    </div>
  )
}
