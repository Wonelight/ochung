'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { selectHouseAction } from '../../nha/actions'

export type ArchivedHouse = { houseId: string; name: string; former: boolean }

/** "Nhà cũ": nhà đã lưu trữ hoặc nhà người dùng đã rời; chạm vào để xem lại lịch sử (chỉ đọc). */
export function ArchivedHouses({ houses }: { houses: ArchivedHouse[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function open(houseId: string) {
    setBusyId(houseId)
    setError(null)
    try {
      const res = await selectHouseAction(houseId)
      if (!res.ok) return setError(res.message)
      router.push('/')
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Nhà cũ</h2>
      <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
        {houses.map((h, i) => (
          <button
            key={h.houseId}
            type="button"
            disabled={busyId !== null}
            onClick={() => void open(h.houseId)}
            className="flex min-h-[60px] cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left font-[inherit] text-text disabled:cursor-default disabled:opacity-60"
            style={i < houses.length - 1 ? { borderBottom: '1px solid var(--c-line)' } : undefined}
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{h.name}</span>
            <span className="text-[12px] font-medium text-muted">{h.former ? 'Đã rời' : 'Đã lưu trữ'} · chỉ xem</span>
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
              className="shrink-0 text-muted"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
    </section>
  )
}
