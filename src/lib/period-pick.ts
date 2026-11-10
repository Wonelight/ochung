import { consumptionMonthDefault } from './billing/period-month'
import type { YM } from './billing/types'

type PeriodRef = { id: string; year: number; month: number; status: 'draft' | 'closed' }

const index = (p: { year: number; month: number }) => p.year * 12 + (p.month - 1)
const ymOfIndex = (i: number): YM => ({ year: Math.floor(i / 12), month: (i % 12) + 1 })

/**
 * Tháng mà trang chủ / màn Hóa đơn hiển thị. `periods` là các tháng người xem thấy được, mới nhất trước
 * (như `listPeriods`: chủ nhà thấy cả nháp, thành viên chỉ thấy tháng đã chốt). Id được chọn không có trong danh sách
 * thì về tháng mới nhất. Mũi tên chuyển tháng đi qua đúng danh sách này.
 */
export function pickPeriod<T extends PeriodRef>(
  periods: T[],
  requestedId: string | undefined,
): { current: T; newerId: string | null; olderId: string | null } | null {
  if (periods.length === 0) return null
  const found = requestedId ? periods.findIndex((p) => p.id === requestedId) : -1
  const i = found === -1 ? 0 : found
  return {
    current: periods[i],
    newerId: i > 0 ? periods[i - 1].id : null,
    olderId: i < periods.length - 1 ? periods[i + 1].id : null,
  }
}

/**
 * Tháng của tab "Hóa đơn tháng N" ở màn Tạo. Còn nháp từ tháng tiêu thụ mặc định trở về trước thì làm nốt nháp
 * cũ nhất; không thì tháng tiêu thụ mặc định, tiến sang tháng sau chừng nào tháng đó đã chốt.
 * `periodId` null = tháng đó chưa có trong sổ (trang tạo nháp khi mở).
 */
export function pickCreateMonth(now: Date, periods: PeriodRef[]): { ym: YM; periodId: string | null } {
  const def = index(consumptionMonthDefault(now))
  const oldDrafts = periods.filter((p) => p.status === 'draft' && index(p) <= def).sort((a, b) => index(a) - index(b))
  if (oldDrafts.length > 0) return { ym: { year: oldDrafts[0].year, month: oldDrafts[0].month }, periodId: oldDrafts[0].id }
  const byIndex = new Map(periods.map((p) => [index(p), p]))
  let i = def
  while (byIndex.get(i)?.status === 'closed') i++
  return { ym: ymOfIndex(i), periodId: byIndex.get(i)?.id ?? null }
}
