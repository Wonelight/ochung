'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Nút "T11/2026 ▾" ở đầu màn Hóa đơn (mockup), mở danh sách các tháng người xem thấy được.
// Menu dùng lại kiểu của danh sách nhà (HouseSwitcherMenu): thẻ surface bo 20, hàng 52px.
export function MonthPicker({ currentId, months }: { currentId: string; months: { id: string; label: string; draft: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const current = months.find((m) => m.id === currentId)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 cursor-pointer items-center gap-1 rounded-[22px] border border-line bg-surface px-3.5 font-[inherit] text-[14px] font-semibold text-text"
      >
        {current?.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đóng danh sách tháng"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default border-0 bg-transparent"
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 flex max-h-[60dvh] w-[200px] flex-col overflow-y-auto rounded-[20px] border border-line bg-surface px-3.5 py-0.5 shadow-[0_10px_24px_var(--c-bar-shadow)]"
          >
            {months.map((m, i) => (
              <Link
                key={m.id}
                href={`/hoa-don?ky=${m.id}`}
                role="menuitemradio"
                aria-checked={m.id === currentId}
                onClick={() => setOpen(false)}
                className={`flex min-h-[52px] items-center gap-2 text-[15px] font-semibold text-text no-underline ${
                  i < months.length - 1 ? 'border-b border-line' : ''
                }`}
              >
                <span className="flex-1">{m.label}</span>
                {m.draft && <span className="text-[12px] font-medium text-accent-text">Nháp</span>}
                {m.id === currentId && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
