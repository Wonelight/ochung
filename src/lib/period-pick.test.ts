import { describe, expect, it } from 'vitest'
import { pickCreateMonth, pickPeriod } from './period-pick'

const p = (id: string, year: number, month: number, status: 'draft' | 'closed') => ({ id, year, month, status })

describe('pickPeriod (tháng trang chủ / hóa đơn hiển thị)', () => {
  // listPeriods trả mới nhất trước
  const list = [p('t12', 2026, 12, 'draft'), p('t11', 2026, 11, 'closed'), p('t10', 2026, 10, 'closed')]

  it('không chọn gì → tháng mới nhất người xem thấy được; mũi tên đi qua các tháng thấy được', () => {
    expect(pickPeriod(list, undefined)).toEqual({ current: list[0], newerId: null, olderId: 't11' })
  })

  it('chọn tháng ở giữa → có cả tháng mới hơn và cũ hơn', () => {
    expect(pickPeriod(list, 't11')).toEqual({ current: list[1], newerId: 't12', olderId: 't10' })
  })

  it('tháng cũ nhất → không có tháng cũ hơn', () => {
    expect(pickPeriod(list, 't10')).toEqual({ current: list[2], newerId: 't11', olderId: null })
  })

  it('id lạ (tháng nháp với thành viên, nhà khác) → về tháng mới nhất', () => {
    expect(pickPeriod(list, 'khong-co')?.current.id).toBe('t12')
  })

  it('chưa có tháng nào → null', () => {
    expect(pickPeriod([], undefined)).toBeNull()
  })
})

describe('pickCreateMonth (tháng của tab "Hóa đơn tháng N")', () => {
  const now = new Date('2026-11-10T03:00:00Z') // tháng tiêu thụ mặc định: 10/2026

  it('chưa có tháng nào → tháng tiêu thụ mặc định, chưa có id', () => {
    expect(pickCreateMonth(now, [])).toEqual({ ym: { year: 2026, month: 10 }, periodId: null })
  })

  it('tháng mặc định đang nháp → dùng nháp đó', () => {
    expect(pickCreateMonth(now, [p('t10', 2026, 10, 'draft')])).toEqual({ ym: { year: 2026, month: 10 }, periodId: 't10' })
  })

  it('tháng mặc định đã chốt → tháng chưa chốt kế tiếp (dùng nháp có sẵn)', () => {
    const list = [p('t11', 2026, 11, 'draft'), p('t10', 2026, 10, 'closed')]
    expect(pickCreateMonth(now, list)).toEqual({ ym: { year: 2026, month: 11 }, periodId: 't11' })
    expect(pickCreateMonth(now, [p('t10', 2026, 10, 'closed')])).toEqual({ ym: { year: 2026, month: 11 }, periodId: null })
  })

  it('còn nháp cũ hơn tháng mặc định chưa chốt → làm nốt nháp cũ nhất trước', () => {
    const list = [p('t11', 2026, 11, 'draft'), p('t9', 2026, 9, 'draft'), p('t8', 2026, 8, 'draft')]
    expect(pickCreateMonth(now, list)).toEqual({ ym: { year: 2026, month: 8 }, periodId: 't8' })
  })

  it('nháp mới hơn (do khoản chi lẻ tạo ra) không chen trước tháng mặc định', () => {
    expect(pickCreateMonth(now, [p('t11', 2026, 11, 'draft')])).toEqual({ ym: { year: 2026, month: 10 }, periodId: null })
  })

  it('qua năm: tháng 1 → tháng 12 năm trước', () => {
    expect(pickCreateMonth(new Date('2027-01-05T03:00:00Z'), [])).toEqual({ ym: { year: 2026, month: 12 }, periodId: null })
  })
})
