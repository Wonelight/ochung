'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Nút sao chép một mã (44px, icon chép từ mockup `Quản lý nhà`). Mặc định là mã nhà (bo 14px);
 * màn `Vào nhà` dùng cho mã tài khoản (bo 12px).
 */
export function CopyCodeButton({
  code,
  label = 'mã nhà',
  radius = 14,
}: {
  code: string
  label?: string
  radius?: 12 | 14
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // trình duyệt chặn clipboard: giữ nguyên, mã vẫn hiển thị để chép tay
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Sao chép ${label}`}
        onClick={copy}
        className={`flex size-11 cursor-pointer items-center justify-center border border-line2 bg-card p-0 text-text ${radius === 12 ? 'rounded-[12px]' : 'rounded-[14px]'}`}
      >
        {copied ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? `Đã sao chép ${label}` : ''}
      </span>
    </>
  )
}
