import { AppError } from '@/lib/errors'
import type { YM } from './types'

/** Asia/Ho_Chi_Minh là UTC+7 quanh năm (không có giờ mùa hè). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

function assertYM(ym: YM): void {
  if (!Number.isInteger(ym.year) || !Number.isInteger(ym.month) || ym.month < 1 || ym.month > 12) {
    throw new AppError('INVALID', 'MONTH_INVALID', 'Tháng không hợp lệ')
  }
}

function nextMonth(ym: YM): YM {
  return ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 }
}

/** Tháng tiêu thụ mặc định = tháng liền trước của `now` tính theo giờ Việt Nam. */
export function consumptionMonthDefault(now: Date): YM {
  const t = now.getTime()
  if (Number.isNaN(t)) {
    throw new AppError('INVALID', 'DATE_INVALID', 'Thời điểm không hợp lệ')
  }
  const vn = new Date(t + VN_OFFSET_MS)
  const year = vn.getUTCFullYear()
  const month = vn.getUTCMonth() + 1
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

export function daysInMonth(ym: YM): number {
  assertYM(ym)
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()
}

/** Hạn thanh toán: ngày `dueDay` (1..28) của tháng kế tiếp, dạng YYYY-MM-DD. */
export function dueDateFor(ym: YM, dueDay: number): string {
  assertYM(ym)
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    throw new AppError('INVALID', 'DUE_DAY_INVALID', 'Ngày đến hạn phải từ 1 đến 28')
  }
  const next = nextMonth(ym)
  const yyyy = String(next.year).padStart(4, '0')
  const mm = String(next.month).padStart(2, '0')
  const dd = String(dueDay).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function monthOfDate(spentOn: string): YM {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spentOn)
  if (m) {
    const ym = { year: Number(m[1]), month: Number(m[2]) }
    const day = Number(m[3])
    if (ym.month >= 1 && ym.month <= 12 && day >= 1 && day <= daysInMonth(ym)) return ym
  }
  throw new AppError('INVALID', 'SPENT_ON_INVALID', 'Ngày chi không hợp lệ (cần YYYY-MM-DD)')
}

/** Tháng mà khoản chi được tính vào: tháng của `spentOn`, tiến sang tháng sau chừng nào tháng đó đã chốt. */
export function resolveExpenseMonth(
  spentOn: string,
  periods: { year: number; month: number; status: 'draft' | 'closed' }[],
): YM {
  const closed = new Set(
    periods.filter((p) => p.status === 'closed').map((p) => `${p.year}-${p.month}`),
  )
  let ym = monthOfDate(spentOn)
  while (closed.has(`${ym.year}-${ym.month}`)) ym = nextMonth(ym)
  return ym
}
