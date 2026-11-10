'use client'

import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { cancelJoinRequestAction, requestJoinAction } from '../actions'

const MIN_CODE_LENGTH = 6

export type PendingRequest = { id: string; houseName: string; houseCode: string }

/**
 * Thẻ "Vào nhà bằng mã" (trạng thái chưa gửi) hoặc "Đang chờ chủ nhà duyệt" (đã gửi), chép từ mockup `Vào nhà`.
 * Còn yêu cầu đang chờ thì chỉ hiện thẻ chờ; hủy rồi mới nhập mã khác.
 */
export function JoinCard({ pending }: { pending: PendingRequest[] }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function guarded(run: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(true)
    setError(null)
    try {
      const res = await run()
      if (!res.ok) return setError(res.message)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.trim().length < MIN_CODE_LENGTH) return setError('Mã nhà gồm 6 ký tự, ví dụ CG-7K2Q')
    void guarded(async () => {
      const res = await requestJoinAction(code)
      if (res.ok) setCode('')
      return res
    })
  }

  if (pending.length > 0) {
    return (
      <>
        {pending.map((r) => (
          <section key={r.id} className="flex flex-col gap-3.5 rounded-[24px] border border-line2 bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[22px] bg-black text-[#F29A5B] shadow-[0_0_0_1px_#E8833A,0_0_14px_rgba(232,131,58,0.45)]">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-[17px] font-semibold">Đang chờ chủ nhà duyệt</span>
                <span className="truncate text-[13px] text-muted">
                  {r.houseName} · mã {r.houseCode}
                </span>
              </div>
            </div>
            <p className="m-0 text-[13px] leading-normal text-muted">Bạn sẽ nhận thông báo khi được duyệt.</p>
            {error && (
              <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void guarded(() => cancelJoinRequestAction(r.id))}
              className="h-12 cursor-pointer rounded-[24px] border border-line2 bg-transparent font-[inherit] text-[15px] font-semibold text-text disabled:cursor-default disabled:opacity-60"
            >
              {busy ? 'Đang hủy…' : 'Hủy yêu cầu'}
            </button>
          </section>
        ))}
      </>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 rounded-[24px] border border-line bg-card p-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[20px] font-bold">Vào nhà bằng mã</h1>
        <p className="m-0 text-[14px] leading-normal text-muted">
          Hỏi chủ nhà mã gồm 6 ký tự. Chủ nhà sẽ duyệt yêu cầu của bạn.
        </p>
      </div>
      <label htmlFor="house-code" className="text-[13px] font-semibold text-muted">
        Mã nhà
      </label>
      <input
        id="house-code"
        type="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={12}
        placeholder="CG-7K2Q"
        value={code}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setCode(e.target.value.toUpperCase())}
        className="-mt-2 h-[60px] rounded-[16px] border-[1.5px] border-[#E8833A] bg-input px-4 text-center font-numeric text-[22px] font-semibold tracking-[0.16em] text-text shadow-[0_0_0_4px_rgba(232,131,58,0.14)] outline-none"
      />
      {error && (
        <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="h-[54px] cursor-pointer rounded-[27px] border-0 bg-accent font-[inherit] text-[16px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
      >
        {busy ? 'Đang gửi…' : 'Gửi yêu cầu vào nhà'}
      </button>
    </form>
  )
}
