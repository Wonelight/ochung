'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createInviteLinkAction, revokeInviteLinkAction } from '../invite-actions'

export type ActiveLink = { id: string; url: string; expiresAt: string }

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })

type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Gửi link qua bảng chia sẻ của hệ điều hành (Zalo, Messenger…); không có thì sao chép vào clipboard.
 * Gọi ngay trong sự kiện bấm (trước mọi `await`) vì iOS chỉ cho mở bảng chia sẻ khi còn trong thao tác của người dùng.
 */
async function shareOrCopy(url: string, houseName: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Lời mời vào nhà', text: `Vào nhà "${houseName}" trên Chi tiêu nhà`, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // bảng chia sẻ bị chặn hoặc lỗi: thử sao chép
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/**
 * Nút "Chia sẻ link mời" + dòng giải thích (chép từ mockup `Quản lý nhà`) và danh sách link còn hiệu lực để hủy.
 * Còn link hiệu lực thì nút chia sẻ link mới nhất; chưa có thì tạo link mới (hạn 7 ngày) rồi chia sẻ.
 */
export function InviteShare({
  houseId,
  houseName,
  links,
}: {
  houseId: string
  houseName: string
  links: ActiveLink[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function report(outcome: ShareOutcome, created: boolean) {
    if (outcome === 'copied') setNotice('Đã sao chép link mời, dán vào Zalo hoặc Messenger để gửi')
    else if (outcome === 'failed') {
      setNotice(created ? 'Đã tạo link mời. Chạm biểu tượng chia sẻ bên dưới để gửi' : null)
      if (!created) setError('Không chia sẻ hoặc sao chép được link. Hãy thử lại')
    } else setNotice(null)
  }

  async function share(link: ActiveLink | null) {
    setError(null)
    setNotice(null)
    if (link) {
      report(await shareOrCopy(link.url, houseName), false)
      return
    }
    setBusy(true)
    try {
      const res = await createInviteLinkAction(houseId)
      if (!res.ok) return setError(res.message)
      router.refresh()
      report(await shareOrCopy(res.data.url, houseName), true)
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(linkId: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await revokeInviteLinkAction(linkId)
      if (!res.ok) return setError(res.message)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void share(links[0] ?? null)}
        className="flex h-[50px] cursor-pointer items-center justify-center gap-2 rounded-[25px] border-0 bg-accent font-[inherit] text-[15px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
      >
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
          <path d="M12 3v12" />
          <path d="m8 7 4-4 4 4" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
        Chia sẻ link mời
      </button>
      <p className="m-0 text-[12px] leading-normal text-muted">
        Vào bằng link mời: không cần duyệt. Vào bằng mã nhà: bạn duyệt bên dưới.
      </p>
      {links.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-muted">Link đang dùng được · hủy khi không cần nữa</span>
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-[16px] bg-inner py-1.5 pl-3.5 pr-1.5">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                Hết hạn {DATE_FORMAT.format(new Date(l.expiresAt))}
              </span>
              <button
                type="button"
                aria-label="Chia sẻ link này"
                onClick={() => void share(l)}
                className="flex size-11 cursor-pointer items-center justify-center rounded-[14px] border border-line2 bg-card p-0 text-text"
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
                  <path d="M12 3v12" />
                  <path d="m8 7 4-4 4 4" />
                  <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Hủy link này"
                disabled={busy}
                onClick={() => void revoke(l.id)}
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
            </div>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="m-0 text-[13px] font-medium text-accent-text">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
    </>
  )
}
