'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { selectHouseAction } from '../actions'

export type PickerHouse = { houseId: string; name: string; role: 'owner' | 'member'; archived: boolean }

const linkClass = 'flex min-h-11 flex-1 items-center justify-center rounded-[16px] border border-line bg-surface px-3 text-[14px] font-semibold text-text no-underline'

/**
 * Danh sách mọi nhà của người dùng ở đầu trang Quản lý nhà: nhà đang quản lý được đánh dấu, chạm vào nhà khác để chuyển
 * (trang tải lại cho nhà đó). Nhà đã rời không có ở đây vì không quản lý được.
 */
export function HousePicker({ houses, currentId }: { houses: PickerHouse[]; currentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function choose(houseId: string) {
    if (houseId === currentId || pending) return
    setError(null)
    startTransition(async () => {
      const res = await selectHouseAction(houseId)
      if (!res.ok) return setError(res.message)
      router.refresh()
    })
  }

  return (
    <section aria-label="Chọn nhà để quản lý" className="flex flex-col gap-2">
      <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Nhà của bạn · {houses.length}</h2>
      <div role="radiogroup" aria-label="Nhà đang quản lý" className="flex flex-col gap-2">
        {houses.map((h) => {
          const selected = h.houseId === currentId
          return (
            <button
              key={h.houseId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => choose(h.houseId)}
              className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[18px] border px-4 text-left font-[inherit] text-text disabled:opacity-60 ${
                selected ? 'border-accent bg-card' : 'border-line bg-surface'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-accent' : 'border-line'}`}
              >
                {selected && <span className="size-2.5 rounded-full bg-accent" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{h.name}</span>
                <span className="text-[12px] text-muted">
                  {h.role === 'owner' ? 'Chủ nhà' : 'Thành viên'}
                  {h.archived ? ' · Đã lưu trữ' : ''}
                </span>
              </span>
              {selected && <span className="shrink-0 text-[12px] font-semibold text-accent-text">Đang quản lý</span>}
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Link href="/nha/moi" className={linkClass}>
          Tạo nhà mới
        </Link>
        <Link href="/vao-nha" className={linkClass}>
          Vào nhà bằng mã
        </Link>
      </div>
    </section>
  )
}
