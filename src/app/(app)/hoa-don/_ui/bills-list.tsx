'use client'

import { useState } from 'react'
import { MemberRow } from '@/components/MemberRow'
import { StatusPill } from '@/components/StatusPill'
import type { PaymentStatus } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import type { BillFilter, PaymentRow } from '@/lib/payments-view'
import { ErrorText, NoticeText, useSave } from '../../nha/_ui/settings-parts'
import { confirmPaymentAction, remindMemberAction } from '../actions'
import { AmountSheet, RejectSheet } from './owner-sheets'

// Bộ lọc 4 ô + danh sách của mockup `Hóa đơn tháng 11`. Số tiền riêng của từng người (spec §10).
// Thao tác của chủ nhà nằm ở cột phải của từng hàng (nút Xác nhận / Nhắc chép từ mockup: cao 36, bo 18, chữ 13); thành viên
// không bao giờ nhận `owner` nên không thấy. Chờ duyệt: Xác nhận / Từ chối / Xem ảnh. Còn thiếu: Nhắc / Ghi tiền mặt.
// Chủ nhà còn nợ: Đã trả lại.
const FILTERS: { value: BillFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unpaid', label: 'Chưa trả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'paid', label: 'Đã trả' },
]

export type OwnerRowInfo = {
  kind: PaymentStatus['kind']
  /** due − đã nhận + đã trả lại. */
  balance: number
  /** Khoản "Tôi đã chuyển" đang chờ duyệt (kèm ảnh nếu có). */
  pending: { id: string; proofUrl: string | null } | null
}
export type OwnerBills = { periodId: string; info: Record<string, OwnerRowInfo> }

type SheetState =
  | { type: 'reject'; paymentId: string; name: string }
  | { type: 'cash' | 'refund'; memberId: string; name: string; max: number }

// Vùng bấm 44px: nút cao 36 như mockup, phần chạm nới thêm 4px mỗi phía.
const hit = "relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
const confirmBtn = `${hit} h-9 min-w-11 cursor-pointer rounded-[18px] border-0 bg-accent px-3.5 font-[inherit] text-[13px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60`
const outlineBtn = `${hit} h-9 min-w-11 cursor-pointer rounded-[18px] border border-line2 bg-transparent px-3.5 font-[inherit] text-[13px] font-semibold text-text disabled:cursor-default disabled:opacity-60`

export function BillsList({ rows, showFilters, owner }: { rows: PaymentRow[]; showFilters: boolean; owner: OwnerBills | null }) {
  const [filter, setFilter] = useState<BillFilter>('all')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const { busy, error, notice, run } = useSave()
  const count = (f: BillFilter) => (f === 'all' ? rows.length : rows.filter((r) => r.filter === f).length)
  const shown = filter === 'all' ? rows : rows.filter((r) => r.filter === filter)

  return (
    <>
      {showFilters && (
        <div role="tablist" aria-label="Lọc theo trạng thái" className="grid grid-cols-4 gap-1 rounded-[16px] border border-line bg-surface p-1">
          {FILTERS.map((f) => {
            const sel = f.value === filter
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={sel}
                onClick={() => setFilter(f.value)}
                className={`h-10 cursor-pointer whitespace-nowrap rounded-[12px] border-0 px-1 font-[inherit] text-[12px] font-semibold ${
                  sel ? 'bg-inner text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'bg-transparent text-muted'
                }`}
              >
                {f.label} {count(f.value)}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
        {shown.map((r, i) => (
          <MemberRow
            key={r.memberId}
            variant="bills"
            name={r.name}
            avatarSeed={r.avatarSeed}
            note={r.isOwner ? 'Phần của chủ nhà' : r.note}
            last={i === shown.length - 1}
            below={
              r.pill ? (
                <StatusPill compact tone={r.pill.tone} text={r.pill.text} className="mt-1 self-start" />
              ) : r.isOwner ? (
                <StatusPill compact tone="neutral" text="Chủ nhà" className="mt-1 self-start" />
              ) : null
            }
            aside={
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="font-numeric text-[14px] font-semibold tracking-[-0.03em] tabular-nums">{formatVnd(r.amount)} đ</span>
                {owner && owner.info[r.memberId] && (
                  <OwnerActions
                    info={owner.info[r.memberId]}
                    busy={busy}
                    onConfirm={(id) => void run(() => confirmPaymentAction(id))}
                    onRemind={() => void run(() => remindMemberAction(owner.periodId, r.memberId), `Đã nhắc ${r.name}`)}
                    onSheet={(kind, info) =>
                      setSheet(
                        kind === 'reject'
                          ? { type: 'reject', paymentId: info.pending!.id, name: r.name }
                          : { type: kind, memberId: r.memberId, name: r.name, max: Math.abs(info.balance) },
                      )
                    }
                  />
                )}
              </div>
            }
          />
        ))}
        {shown.length === 0 && <p className="m-0 py-7 text-center text-[14px] text-muted">Không có hóa đơn nào ở trạng thái này.</p>}
      </div>
      <ErrorText>{error}</ErrorText>
      <NoticeText>{notice}</NoticeText>

      {owner && sheet?.type === 'reject' && <RejectSheet paymentId={sheet.paymentId} name={sheet.name} onClose={() => setSheet(null)} />}
      {owner && (sheet?.type === 'cash' || sheet?.type === 'refund') && (
        <AmountSheet
          kind={sheet.type}
          periodId={owner.periodId}
          memberId={sheet.memberId}
          name={sheet.name}
          max={sheet.max}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}

function OwnerActions({
  info,
  busy,
  onConfirm,
  onRemind,
  onSheet,
}: {
  info: OwnerRowInfo
  busy: boolean
  onConfirm: (paymentId: string) => void
  onRemind: () => void
  onSheet: (kind: 'reject' | 'cash' | 'refund', info: OwnerRowInfo) => void
}) {
  if (info.pending) {
    const pendingId = info.pending.id
    return (
      <>
        <button type="button" disabled={busy} onClick={() => onConfirm(pendingId)} className={confirmBtn}>
          Xác nhận
        </button>
        <button type="button" disabled={busy} onClick={() => onSheet('reject', info)} className={outlineBtn}>
          Từ chối
        </button>
        {info.pending.proofUrl && (
          <a
            href={info.pending.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center text-[13px] font-semibold text-accent-text no-underline"
          >
            Xem ảnh
          </a>
        )}
      </>
    )
  }
  if (info.kind === 'owner_owes') {
    return (
      <button type="button" disabled={busy} onClick={() => onSheet('refund', info)} className={confirmBtn}>
        Đã trả lại
      </button>
    )
  }
  if (info.kind === 'unpaid' || info.kind === 'partial') {
    return (
      <>
        <button type="button" disabled={busy} onClick={onRemind} className={outlineBtn}>
          Nhắc
        </button>
        <button type="button" disabled={busy} onClick={() => onSheet('cash', info)} className={outlineBtn}>
          Ghi tiền mặt
        </button>
      </>
    )
  }
  return null
}
