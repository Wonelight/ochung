'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { selectHouseAction } from '@/app/(app)/nha/actions'
import type { HouseSummary } from '@/server/houses'

export function HouseSwitcherMenu({
  houses,
  currentId,
  align = 'start',
}: {
  houses: HouseSummary[]
  currentId: string
  align?: 'start' | 'center'
}) {
  const centered = align === 'center'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = houses.find((h) => h.houseId === currentId)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function choose(houseId: string) {
    if (houseId === currentId) return setOpen(false)
    setError(null)
    const res = await selectHouseAction(houseId)
    if (!res.ok) return setError(res.message)
    setOpen(false)
    router.push('/')
    router.refresh()
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-[26px] max-w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-[inherit] text-[17px] font-semibold text-text ${centered ? 'mx-auto' : ''}`}
      >
        <span className="truncate">{current?.name ?? 'Chọn nhà'}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đóng danh sách nhà"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default border-0 bg-transparent"
          />
          <div
            role="menu"
            className={`absolute top-full z-40 mt-2 flex w-[280px] max-w-[calc(100vw-40px)] flex-col ${centered ? 'left-1/2 -translate-x-1/2' : 'left-0'} rounded-[20px] border border-line bg-surface px-3.5 py-0.5 shadow-[0_10px_24px_var(--c-bar-shadow)]`}
          >
            {houses.map((h) => (
              <button
                key={h.houseId}
                type="button"
                role="menuitemradio"
                aria-checked={h.houseId === currentId}
                onClick={() => choose(h.houseId)}
                className="flex min-h-[52px] cursor-pointer items-center gap-2 border-0 border-b border-line bg-transparent p-0 text-left font-[inherit] text-[15px] font-semibold text-text"
              >
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                {(h.former || h.archived) && (
                  <span className="text-[12px] font-medium text-muted">{h.former ? 'Đã rời' : 'Đã lưu trữ'}</span>
                )}
                {h.houseId === currentId && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#E8833A"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            <Link
              href="/nha/moi"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-[52px] items-center text-[15px] font-semibold text-accent-text no-underline"
            >
              Tạo nhà mới
            </Link>
            {error && (
              <p role="alert" className="m-0 pb-2 text-[13px] font-medium text-unpaid-fg">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
