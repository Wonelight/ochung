'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOutClient } from '@/lib/sign-out'

/** Nút Đăng xuất (mockup `Cài đặt`). Gỡ thông báo đẩy của thiết bị trước khi hủy phiên (xem signOutClient). */
export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onClick() {
    if (pending) return
    setPending(true)
    try {
      await signOutClient()
    } finally {
      router.replace('/login')
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[26px] border border-[var(--c-danger-line)] bg-transparent font-[inherit] text-[15px] font-semibold text-unpaid-fg disabled:cursor-default disabled:opacity-60"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
    </button>
  )
}
