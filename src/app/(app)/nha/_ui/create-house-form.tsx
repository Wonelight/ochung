'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createHouseAction } from '../actions'

const NAME_MAX = 60

export function CreateHouseForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('house-name') ?? '').trim()
    if (!name) return setError('Hãy nhập tên nhà')
    setError(null)
    setPending(true)
    try {
      const res = await createHouseAction({ name })
      if (!res.ok) {
        setError(res.message)
        setPending(false)
        return
      }
      router.replace('/nha')
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] border border-line bg-card p-[18px]"
    >
      <svg
        width="100%"
        height="64"
        viewBox="0 0 350 64"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute left-0 top-0 block"
      >
        <circle cx="300" cy="36" r="18" fill="#E8833A" style={{ fillOpacity: 'var(--c-sun-op)' }} />
        <path d="M0 50 Q110 30 210 46 T350 38 V64 H0Z" style={{ fill: 'var(--c-ridge)' }} />
      </svg>
      <div className="relative flex flex-col gap-0.5">
        <span className="text-[20px] font-bold">Nhà mới</span>
        <span className="text-[13px] text-muted">Bạn sẽ là chủ nhà. Mã nhà được tạo tự động để mời người khác vào.</span>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="house-name" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Tên nhà
        </label>
        <input
          id="house-name"
          name="house-name"
          type="text"
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder="VD: Nhà Cầu Giấy"
          required
          className="h-[50px] min-w-0 rounded-[14px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none focus:border-accent"
        />
      </div>
      {error && (
        <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex h-[50px] cursor-pointer items-center justify-center rounded-[25px] border-0 bg-accent font-[inherit] text-[15px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
      >
        {pending ? 'Đang tạo…' : 'Tạo nhà'}
      </button>
    </form>
  )
}
