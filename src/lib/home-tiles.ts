import type { ExpenseInput, FixedItem, PeriodResult } from './billing/types'
import { formatVnd } from './money'
import type { UtilityKey } from './period-edits'

export type HomeTile = {
  key: string
  label: string
  /** null = điện/nước chưa nhập. */
  amount: number | null
  note: string
  source: { type: 'electricity' | 'water' | 'expenses' } | { type: 'item'; name: string; kind: FixedItem['kind'] }
  /** Hàng rộng cả hai cột (như "Tiền nhà" trong mockup). */
  wide: boolean
}

const UNIT: Record<UtilityKey, string> = { electricity: 'kWh', water: 'm³' }

function utilityTile(key: UtilityKey, label: string, r: PeriodResult['electricity']): HomeTile {
  let note = 'Chưa nhập'
  if (r) note = r.usage !== undefined ? `${formatVnd(r.usage)} ${UNIT[key]}` : 'Theo hóa đơn'
  return { key, label, amount: r ? r.total : null, note, source: { type: key }, wide: false }
}

/**
 * Các ô của thẻ tháng trên Trang chủ: Điện, Nước, rồi các khoản cố định đang bật và ô Chi lẻ.
 * Như mockup, khoản lớn nhất (thường là tiền nhà) là hàng rộng ở cuối; nếu số ô vuông còn lại lẻ thì ô cuối cũng rộng
 * để lưới hai cột không bị hở. Số tiền mỗi khoản là tổng thật của cả nhà (cộng từ các phiếu).
 */
export function homeTiles(v: {
  result: PeriodResult
  items: FixedItem[]
  expenses: ExpenseInput[]
}): HomeTile[] {
  const itemTotal = new Map<string, number>()
  for (const slip of v.result.payslips) {
    for (const l of slip.lines) {
      if (l.group === 'fixed') itemTotal.set(l.key, (itemTotal.get(l.key) ?? 0) + l.amount)
    }
  }
  const others: HomeTile[] = v.items
    .filter((i) => i.enabled && (itemTotal.get(`item:${i.id}`) ?? 0) > 0)
    .map((i) => ({
      key: `item:${i.id}`,
      label: i.name,
      amount: itemTotal.get(`item:${i.id}`) ?? 0,
      note: i.kind === 'per_unit' ? 'Theo người' : 'Cố định',
      source: { type: 'item', name: i.name, kind: i.kind },
      wide: false,
    }))
  const biggest = others.reduce<HomeTile | null>((best, t) => (best === null || (t.amount ?? 0) > (best.amount ?? 0) ? t : best), null)
  const rest = others.filter((t) => t !== biggest)
  const expenseTotal = v.expenses.reduce((s, e) => s + e.amount, 0)
  if (v.expenses.length > 0) {
    rest.push({ key: 'expenses', label: 'Chi lẻ', amount: expenseTotal, note: `${v.expenses.length} khoản`, source: { type: 'expenses' }, wide: false })
  }
  if (rest.length % 2 === 1) rest[rest.length - 1] = { ...rest[rest.length - 1], wide: true }
  return [
    utilityTile('electricity', 'Điện', v.result.electricity),
    utilityTile('water', 'Nước', v.result.water),
    ...rest,
    ...(biggest ? [{ ...biggest, wide: true }] : []),
  ]
}
