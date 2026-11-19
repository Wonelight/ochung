import { consumptionMonthDefault, currentMonthVn } from './billing/period-month'
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
  // Nhà mà kỳ đầu tiên đã mới hơn tháng mặc định (chủ nhà chọn bắt đầu từ tháng đó, xem `parseStartMonth`) thì tháng
  // mặc định không phải việc còn dở: coi kỳ đầu tiên là điểm xuất phát, không tự tạo lại tháng đã bỏ qua.
  const earliest = periods.length > 0 ? Math.min(...periods.map(index)) : -Infinity
  const def = Math.max(index(consumptionMonthDefault(now)), earliest)
  const oldDrafts = periods.filter((p) => p.status === 'draft' && index(p) <= def).sort((a, b) => index(a) - index(b))
  if (oldDrafts.length > 0) return { ym: { year: oldDrafts[0].year, month: oldDrafts[0].month }, periodId: oldDrafts[0].id }
  const byIndex = new Map(periods.map((p) => [index(p), p]))
  let i = def
  while (byIndex.get(i)?.status === 'closed') i++
  return { ym: ymOfIndex(i), periodId: byIndex.get(i)?.id ?? null }
}

// ───────────────────────── Nhà chưa có hóa đơn nào: chọn tháng bắt đầu ─────────────────────────
// Kỳ tính theo tháng tiêu thụ (tháng liền trước), nên ngày 19/11 kỳ đầu tiên mặc định là tháng 10. Nhà mới có thể
// bỏ qua nó và bắt đầu từ tháng hiện tại; chỉ hai lựa chọn đó (xa hơn là gõ nhầm). Chọn xong mới tạo kỳ nháp,
// nên tháng bị bỏ không bao giờ được tạo ra.

const START_RE = /^(\d{4})-(\d{2})$/

/** `?start=YYYY-MM` của trang chủ / màn Tạo. */
export function startMonthParam(ym: YM): string {
  return `${String(ym.year).padStart(4, '0')}-${String(ym.month).padStart(2, '0')}`
}

/** Tháng bắt đầu hợp lệ: tháng tiêu thụ mặc định hoặc tháng hiện tại. Sai dạng hoặc ngoài khoảng → null. */
export function parseStartMonth(raw: string | undefined, now: Date): YM | null {
  const m = raw ? START_RE.exec(raw) : null
  if (!m) return null
  const ym = { year: Number(m[1]), month: Number(m[2]) }
  const i = index(ym)
  return ym.month >= 1 && ym.month <= 12 && i >= index(consumptionMonthDefault(now)) && i <= index(currentMonthVn(now)) ? ym : null
}

/** Mũi tên chuyển tháng bắt đầu: lùi tới tháng mặc định, tiến tới tháng hiện tại. */
export function startNeighbors(ym: YM, now: Date): { older: YM | null; newer: YM | null } {
  const i = index(ym)
  return {
    older: i > index(consumptionMonthDefault(now)) ? ymOfIndex(i - 1) : null,
    newer: i < index(currentMonthVn(now)) ? ymOfIndex(i + 1) : null,
  }
}
