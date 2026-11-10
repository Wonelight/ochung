import { DOT, itemIconKind } from '@/components/CategoryIcon'
import { formatVnd } from '@/lib/money'
import type { PeriodView } from '@/server/periods'

// Danh sách khoản cố định của cả nhà trong thẻ tháng (mockup `Biểu phí tháng 11`): nền inner bo 18, hàng cao 44,
// chấm màu 8px, khoản theo người ghi "· số lượng × đơn giá". Thêm hàng "Chi lẻ" khi tháng có khoản chi lẻ.
export function MonthItems({ view }: { view: PeriodView }) {
  const included = view.members.filter((m) => m.included)
  const rows: { key: string; dot: string; label: string; detail?: string; amount: number }[] = []
  for (const i of view.items) {
    if (!i.enabled) continue
    if (i.kind === 'equal') {
      if (i.amount > 0) rows.push({ key: i.id, dot: DOT[itemIconKind(i.name, i.kind)], label: i.name, amount: i.amount })
      continue
    }
    const qty = included.reduce((s, m) => s + (m.qty[i.id] ?? 0), 0)
    if (qty > 0) {
      rows.push({ key: i.id, dot: DOT[itemIconKind(i.name, i.kind)], label: i.name, detail: `${qty} × ${formatVnd(i.amount)}`, amount: qty * i.amount })
    }
  }
  const expenseTotal = view.expenses.reduce((s, e) => s + e.amount, 0)
  if (view.expenses.length > 0) {
    rows.push({ key: 'expenses', dot: DOT.receipt, label: 'Chi lẻ', detail: `${view.expenses.length} khoản`, amount: expenseTotal })
  }
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col rounded-[18px] bg-inner px-3.5 py-1.5">
      {rows.map((r, idx) => (
        <div key={r.key} className={`flex min-h-11 items-center gap-2.5 ${idx < rows.length - 1 ? 'border-b border-line2' : ''}`}>
          <span className={`size-2 shrink-0 rounded-[4px] ${r.dot}`} />
          <span className="min-w-0 flex-1 text-[14px]">
            {r.label}
            {r.detail && <span className="text-muted"> · {r.detail}</span>}
          </span>
          <span className="text-[14px] font-semibold tabular-nums">{formatVnd(r.amount)} đ</span>
        </div>
      ))}
    </div>
  )
}
