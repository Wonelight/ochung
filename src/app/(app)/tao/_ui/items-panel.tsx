'use client'

import type { FixedItem, PeriodMember } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { Switch } from '../../nha/_ui/settings-parts'

// Danh sách công tắc khoản cố định của mockup `Tạo hóa đơn tháng`: hàng cao 52, số tiền mờ (faint) khi tắt.
// Khoản theo người ghi "· số lượng × đơn giá" (như "Gửi xe · 2 xe" của mockup), số lượng cộng từ người đang được tính.
export function ItemsPanel({
  items,
  members,
  enabled,
  included,
  onToggle,
}: {
  items: FixedItem[]
  members: PeriodMember[]
  enabled: Record<string, boolean>
  included: Record<string, boolean>
  onToggle: (itemId: string, on: boolean) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col rounded-[20px] border border-line bg-[var(--c-create-panel)] px-3.5 py-1">
      {items.map((item, i) => {
        const on = enabled[item.id] ?? item.enabled
        const qty = item.kind === 'per_unit' ? members.filter((m) => included[m.memberId]).reduce((s, m) => s + (m.qty[item.id] ?? 0), 0) : 0
        const amount = item.kind === 'per_unit' ? qty * item.amount : item.amount
        return (
          <div key={item.id} className={`flex min-h-[52px] items-center gap-2.5 ${i < items.length - 1 ? 'border-b border-line' : ''}`}>
            <span className="min-w-0 flex-1 text-[15px]">
              {item.name}
              {item.kind === 'per_unit' && <span className="text-muted"> · {qty} × {formatVnd(item.amount)}</span>}
            </span>
            <span className={`text-[14px] font-semibold tabular-nums ${on ? 'text-text' : 'text-faint'}`}>{formatVnd(amount)} đ</span>
            <Switch checked={on} onChange={(v) => onToggle(item.id, v)} label={`Tính ${item.name} vào hóa đơn`} />
          </div>
        )
      })}
    </div>
  )
}
