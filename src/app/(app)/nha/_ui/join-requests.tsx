'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { avatarSeed } from '@/lib/avatar-seed'
import { decideJoinRequestAction } from '../invite-actions'

export type RequestRow = { id: string; name: string; avatarVariant: number; note: string }

/** Khối "Chờ duyệt · N" (chép từ mockup `Quản lý nhà`): Duyệt hoặc Từ chối từng yêu cầu vào nhà bằng mã. */
export function JoinRequests({ requests }: { requests: RequestRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusyId(id)
    setError(null)
    try {
      const res = await decideJoinRequestAction(id, decision)
      if (!res.ok) setError(res.message)
      // lỗi "đã xử lý rồi" cũng cần làm mới để dòng biến mất
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-text">
        Chờ duyệt · {requests.length}
      </h2>
      <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
        {requests.map((r, i) => (
          <div
            key={r.id}
            className="flex min-h-16 items-center gap-2.5"
            style={i < requests.length - 1 ? { borderBottom: '1px solid var(--c-line)' } : undefined}
          >
            <Avatar seed={avatarSeed(r.name, r.avatarVariant)} size={40} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold">{r.name}</span>
              <span className="text-[12px] text-muted">{r.note}</span>
            </div>
            <button
              type="button"
              aria-label={`Từ chối ${r.name}`}
              disabled={busyId !== null}
              onClick={() => void decide(r.id, 'reject')}
              className="flex size-11 cursor-pointer items-center justify-center rounded-[22px] border border-line2 bg-transparent p-0 text-muted disabled:cursor-default disabled:opacity-60"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={`Duyệt ${r.name}`}
              disabled={busyId !== null}
              onClick={() => void decide(r.id, 'approve')}
              className="h-11 cursor-pointer rounded-[22px] border-0 bg-accent px-4 font-[inherit] text-[14px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
            >
              Duyệt
            </button>
          </div>
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
