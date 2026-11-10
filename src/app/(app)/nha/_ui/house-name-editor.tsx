'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { renameHouseAction } from '../actions'

/** Tên nhà ở đầu thẻ (20px/700 như mockup). Chủ nhà có nút bút chì để sửa ngay tại chỗ. */
export function HouseNameEditor({ houseId, name, canEdit }: { houseId: string; name: string; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next = String(new FormData(e.currentTarget).get('rename') ?? '').trim()
    if (next === name) return setEditing(false)
    setError(null)
    setPending(true)
    try {
      const res = await renameHouseAction(houseId, next)
      if (!res.ok) return setError(res.message)
      setEditing(false)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="rename" className="sr-only">
          Tên nhà
        </label>
        <div className="flex gap-2">
          <input
            id="rename"
            name="rename"
            type="text"
            defaultValue={name}
            maxLength={60}
            autoFocus
            autoComplete="off"
            required
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] font-semibold text-text outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-11 cursor-pointer rounded-[22px] border-0 bg-accent px-4 font-[inherit] text-[14px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
          >
            {pending ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setEditing(false)
              setError(null)
            }}
            className="h-11 cursor-pointer rounded-[22px] border border-line2 bg-transparent px-3.5 font-[inherit] text-[14px] font-semibold text-muted"
          >
            Hủy
          </button>
        </div>
        {error && (
          <p role="alert" className="m-0 text-[13px] font-medium text-unpaid-fg">
            {error}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="min-w-0 text-[20px] font-bold">{name}</span>
      {canEdit && (
        <button
          type="button"
          aria-label="Sửa tên nhà"
          onClick={() => setEditing(true)}
          className="-my-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[22px] border-0 bg-transparent p-0 text-muted"
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
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>
      )}
    </div>
  )
}
