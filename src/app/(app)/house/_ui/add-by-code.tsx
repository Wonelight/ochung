'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { addMemberByAccountCodeAction } from '../invite-actions'

/** Khối "Thêm bằng mã tài khoản" (chép từ mockup `Quản lý nhà`): chủ nhà nhập mã `U-xxxxx` để thêm thẳng một người. */
export function AddByCode({ houseId }: { houseId: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!code.trim()) return setError('Hãy nhập mã tài khoản, ví dụ U-48213')
    setBusy(true)
    try {
      const res = await addMemberByAccountCodeAction(houseId, code)
      if (!res.ok) return setError(res.message)
      setCode('')
      setNotice(`Đã thêm ${res.data.displayName} vào nhà`)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor="acc-code" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
        Thêm bằng mã tài khoản
      </label>
      <div className="flex gap-2">
        <input
          id="acc-code"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="VD: U-48213"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-[50px] min-w-0 flex-1 rounded-[14px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-[50px] cursor-pointer items-center gap-1.5 rounded-[14px] border border-line2 bg-inner px-[18px] font-[inherit] text-[15px] font-semibold text-text disabled:cursor-default disabled:opacity-60"
        >
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </svg>
          {busy ? 'Đang thêm…' : 'Thêm'}
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 text-[13px] font-medium text-accent-text">
          {notice}
        </p>
      )}
    </form>
  )
}
