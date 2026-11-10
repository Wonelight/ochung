'use client'

import { useState } from 'react'
import { MemberRow } from '@/components/MemberRow'
import { StatusPill } from '@/components/StatusPill'
import { formatVnd } from '@/lib/money'
import type { BillFilter, PaymentRow } from '@/lib/payments-view'

// Bộ lọc 4 ô + danh sách của mockup `Hóa đơn tháng 11`. Số tiền riêng của từng người (spec §10).
// Thao tác của chủ nhà (Xác nhận / Từ chối / Nhắc) do Task 13–14 nối vào cột phải; thành viên không bao giờ thấy.
const FILTERS: { value: BillFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unpaid', label: 'Chưa trả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'paid', label: 'Đã trả' },
]

export function BillsList({ rows, showFilters }: { rows: PaymentRow[]; showFilters: boolean }) {
  const [filter, setFilter] = useState<BillFilter>('all')
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
              </div>
            }
          />
        ))}
        {shown.length === 0 && <p className="m-0 py-7 text-center text-[14px] text-muted">Không có hóa đơn nào ở trạng thái này.</p>}
      </div>
    </>
  )
}
