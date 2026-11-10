import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import {
  consumptionMonthDefault,
  daysInMonth,
  dueDateFor,
  resolveExpenseMonth,
} from './period-month'

describe('consumptionMonthDefault', () => {
  it('trả tháng trước của now theo giờ VN', () => {
    expect(consumptionMonthDefault(new Date('2026-12-02T01:00:00+07:00'))).toEqual({
      year: 2026,
      month: 11,
    })
  })

  it('qua năm: tháng 1 → tháng 12 năm trước', () => {
    expect(consumptionMonthDefault(new Date('2027-01-01T00:30:00+07:00'))).toEqual({
      year: 2026,
      month: 12,
    })
  })

  it('dùng ngày giờ VN, không phải UTC', () => {
    // 2026-12-31T20:00Z = 03:00 ngày 1/1/2027 giờ VN → tháng trước là 2026-12
    expect(consumptionMonthDefault(new Date('2026-12-31T20:00:00Z'))).toEqual({
      year: 2026,
      month: 12,
    })
    // 2026-11-30T17:00Z = 00:00 ngày 1/12 giờ VN → tháng trước là 2026-11
    expect(consumptionMonthDefault(new Date('2026-11-30T17:00:00Z'))).toEqual({
      year: 2026,
      month: 11,
    })
    // 2026-11-30T16:59Z = 23:59 ngày 30/11 giờ VN → tháng trước là 2026-10
    expect(consumptionMonthDefault(new Date('2026-11-30T16:59:00Z'))).toEqual({
      year: 2026,
      month: 10,
    })
  })

  it('từ chối Date không hợp lệ', () => {
    expect(() => consumptionMonthDefault(new Date('không phải ngày'))).toThrow(AppError)
  })
})

describe('dueDateFor', () => {
  it('ngày dueDay của tháng kế tiếp', () => {
    expect(dueDateFor({ year: 2026, month: 11 }, 10)).toBe('2026-12-10')
  })

  it('qua năm', () => {
    expect(dueDateFor({ year: 2026, month: 12 }, 10)).toBe('2027-01-10')
  })

  it('đệm số 0 cho tháng và ngày', () => {
    expect(dueDateFor({ year: 2026, month: 1 }, 5)).toBe('2026-02-05')
  })

  it('từ chối dueDay ngoài 1..28 hoặc không nguyên', () => {
    for (const d of [0, 29, -1, 10.5, Number.NaN]) {
      expect(() => dueDateFor({ year: 2026, month: 11 }, d)).toThrow(AppError)
    }
    expect(dueDateFor({ year: 2026, month: 1 }, 28)).toBe('2026-02-28')
    expect(dueDateFor({ year: 2026, month: 1 }, 1)).toBe('2026-02-01')
  })

  it('từ chối tháng không hợp lệ', () => {
    expect(() => dueDateFor({ year: 2026, month: 13 }, 10)).toThrow(AppError)
    expect(() => dueDateFor({ year: 2026, month: 0 }, 10)).toThrow(AppError)
  })
})

describe('daysInMonth', () => {
  it('năm nhuận và không nhuận', () => {
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29)
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28)
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28)
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29)
  })

  it('tháng 30 và 31 ngày', () => {
    expect(daysInMonth({ year: 2026, month: 4 })).toBe(30)
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31)
  })

  it('từ chối tháng không hợp lệ', () => {
    expect(() => daysInMonth({ year: 2026, month: 13 })).toThrow(AppError)
  })
})

describe('resolveExpenseMonth', () => {
  it('tháng đã chốt → sang tháng sau', () => {
    expect(resolveExpenseMonth('2026-11-28', [{ year: 2026, month: 11, status: 'closed' }])).toEqual({
      year: 2026,
      month: 12,
    })
  })

  it('tháng draft hoặc chưa có kỳ → giữ nguyên', () => {
    expect(resolveExpenseMonth('2026-11-28', [{ year: 2026, month: 11, status: 'draft' }])).toEqual({
      year: 2026,
      month: 11,
    })
    expect(resolveExpenseMonth('2026-11-28', [])).toEqual({ year: 2026, month: 11 })
  })

  it('nhiều tháng liên tiếp đã chốt, qua năm', () => {
    expect(
      resolveExpenseMonth('2026-10-05', [
        { year: 2026, month: 10, status: 'closed' },
        { year: 2026, month: 11, status: 'closed' },
      ]),
    ).toEqual({ year: 2026, month: 12 })
    expect(
      resolveExpenseMonth('2026-12-05', [{ year: 2026, month: 12, status: 'closed' }]),
    ).toEqual({ year: 2027, month: 1 })
  })

  it('dừng ở tháng draft đầu tiên; tháng đã chốt xa hơn không ảnh hưởng', () => {
    expect(
      resolveExpenseMonth('2026-10-05', [
        { year: 2026, month: 10, status: 'closed' },
        { year: 2026, month: 11, status: 'draft' },
        { year: 2026, month: 12, status: 'closed' },
      ]),
    ).toEqual({ year: 2026, month: 11 })
  })

  it('từ chối spentOn sai định dạng hoặc ngày không có thật', () => {
    for (const s of ['2026-1-05', '26-11-05', '2026-13-01', '2026-02-30', '2026-11-00', 'abc', '']) {
      expect(() => resolveExpenseMonth(s, [])).toThrow(AppError)
    }
  })
})
