'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { avatarSeed } from '@/lib/avatar-seed'
import { leaveHouseAction, removeMemberAction } from '../actions'

export type MemberRowData = { id: string; displayName: string; avatarVariant: number; role: 'owner' | 'member' }

type Pending = { kind: 'remove' | 'leave'; member: MemberRowData }

/**
 * Danh sách thành viên (chép từ mockup `Quản lý nhà`). Nút "⋯" mở menu một việc:
 * chủ nhà xóa thành viên khác, thành viên tự rời nhà; cả hai đều qua bước xác nhận.
 * Nhà đã lưu trữ chỉ xem nên không có menu.
 */
export function MembersList({
  houseId,
  members,
  viewerMemberId,
  viewerIsOwner,
  archived,
}: {
  houseId: string
  members: MemberRowData[]
  viewerMemberId: string
  viewerIsOwner: boolean
  archived: boolean
}) {
  const router = useRouter()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionFor = (m: MemberRowData): Pending['kind'] | null => {
    if (archived || m.role === 'owner') return null
    if (viewerIsOwner) return 'remove'
    return m.id === viewerMemberId ? 'leave' : null
  }

  function close() {
    setConfirm(null)
    setError(null)
  }

  async function run() {
    if (!confirm) return
    setBusy(true)
    setError(null)
    try {
      const res =
        confirm.kind === 'remove'
          ? await removeMemberAction(houseId, confirm.member.id)
          : await leaveHouseAction(houseId)
      if (!res.ok) return setError(res.message)
      setConfirm(null)
      // hành động đã làm mới layout; rời nhà thì về trang chủ (không gọi thêm refresh: dễ chồng với chuyển hướng)
      if (confirm.kind === 'leave') router.replace('/')
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
        {members.map((m, i) => {
          const action = actionFor(m)
          const owner = m.role === 'owner'
          return (
            <div
              key={m.id}
              className="relative flex min-h-[60px] items-center gap-3"
              style={i < members.length - 1 ? { borderBottom: '1px solid var(--c-line)' } : undefined}
            >
              <Avatar seed={avatarSeed(m.displayName, m.avatarVariant)} size={40} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.displayName}</span>
              <span
                className={`rounded-full px-[9px] py-1 text-[12px] font-semibold ${owner ? 'bg-accent text-[#1A0F06]' : 'bg-inner text-muted'}`}
              >
                {owner ? 'Chủ nhà' : 'Thành viên'}
              </span>
              {action ? (
                <button
                  type="button"
                  aria-label={`Tùy chọn cho ${m.displayName}`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === m.id}
                  onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-[22px] border-0 bg-transparent p-0 text-muted"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="5" cy="12" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                  </svg>
                </button>
              ) : (
                <span className="size-11 shrink-0" />
              )}
              {action && menuFor === m.id && (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Đóng menu"
                    onClick={() => setMenuFor(null)}
                    className="fixed inset-0 z-30 cursor-default border-0 bg-transparent"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%-6px)] z-40 flex min-w-[170px] flex-col rounded-[16px] border border-line bg-raised px-3.5 py-0.5 shadow-[0_10px_24px_var(--c-bar-shadow)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuFor(null)
                        setConfirm({ kind: action, member: m })
                      }}
                      className="flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-left font-[inherit] text-[15px] font-semibold text-unpaid-fg"
                    >
                      {action === 'remove' ? 'Xóa khỏi nhà' : 'Rời nhà'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      {confirm && (
        <ConfirmSheet
          title={confirm.kind === 'remove' ? `Xóa ${confirm.member.displayName} khỏi nhà?` : 'Rời khỏi nhà này?'}
          body={
            confirm.kind === 'remove'
              ? 'Người này sẽ không còn xem được nhà nữa. Tên vẫn còn trong các tháng đã chốt.'
              : 'Bạn sẽ không còn xem được nhà này nữa. Muốn vào lại, chủ nhà phải mời hoặc duyệt lại.'
          }
          confirmLabel={confirm.kind === 'remove' ? 'Xóa' : 'Rời nhà'}
          pending={busy}
          error={error}
          onConfirm={run}
          onCancel={close}
        />
      )}
    </>
  )
}
