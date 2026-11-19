import { describe, expect, it } from 'vitest'
import { createMonthNav, parseMonthParam, parseStartMonth, pickCreateMonth, pickPeriod, startMonthParam, startNeighbors } from './period-pick'

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

  it('nhà chỉ có kỳ mới hơn tháng mặc định (chủ nhà đã chọn bắt đầu từ tháng đó) → không tự mở lại tháng mặc định', () => {
    expect(pickCreateMonth(now, [p('t11', 2026, 11, 'draft')])).toEqual({ ym: { year: 2026, month: 11 }, periodId: 't11' })
    expect(pickCreateMonth(now, [p('t11', 2026, 11, 'closed')])).toEqual({ ym: { year: 2026, month: 12 }, periodId: null })
  })

  it('nháp mới hơn không chen trước tháng mặc định khi nhà đã có kỳ từ trước đó', () => {
    const list = [p('t11', 2026, 11, 'draft'), p('t9', 2026, 9, 'closed')]
    expect(pickCreateMonth(now, list)).toEqual({ ym: { year: 2026, month: 10 }, periodId: null })
  })

  it('qua năm: tháng 1 → tháng 12 năm trước', () => {
    expect(pickCreateMonth(new Date('2027-01-05T03:00:00Z'), [])).toEqual({ ym: { year: 2026, month: 12 }, periodId: null })
  })
})

describe('chọn tháng ở màn Tạo (?month=)', () => {
  const now = new Date('2026-11-19T03:00:00Z') // mặc định 10/2026, hiện tại 11/2026
  const oct = p('t10', 2026, 10, 'draft')

  it('chọn được tháng mặc định, tháng hiện tại và mọi kỳ đã có', () => {
    expect(parseMonthParam('2026-10', now, [])).toEqual({ year: 2026, month: 10 })
    expect(parseMonthParam('2026-11', now, [oct])).toEqual({ year: 2026, month: 11 })
    expect(parseMonthParam('2026-06', now, [p('t6', 2026, 6, 'closed')])).toEqual({ year: 2026, month: 6 })
  })

  it('từ chối tháng ngoài khoảng, chưa có kỳ, hoặc sai dạng', () => {
    for (const raw of ['2026-09', '2026-12', '2026-13', 'abc', '', undefined]) {
      expect(parseMonthParam(raw, now, [oct])).toBeNull()
    }
  })

  it('mũi tên: từ tháng mặc định tiến tới tháng hiện tại và ngược lại', () => {
    expect(createMonthNav({ year: 2026, month: 10 }, now, [oct])).toEqual({ older: null, newer: { year: 2026, month: 11 } })
    expect(createMonthNav({ year: 2026, month: 11 }, now, [oct])).toEqual({ older: { year: 2026, month: 10 }, newer: null })
  })

  it('mũi tên mở rộng theo kỳ cũ hơn / mới hơn đã có trong sổ', () => {
    const list = [p('t12', 2026, 12, 'draft'), p('t8', 2026, 8, 'closed')]
    expect(createMonthNav({ year: 2026, month: 10 }, now, list)).toEqual({ older: { year: 2026, month: 9 }, newer: { year: 2026, month: 11 } })
    expect(createMonthNav({ year: 2026, month: 8 }, now, list).older).toBeNull()
    expect(createMonthNav({ year: 2026, month: 12 }, now, list).newer).toBeNull()
  })
})

describe('tháng bắt đầu của nhà chưa có hóa đơn nào', () => {
  const now = new Date('2026-11-19T03:00:00Z') // tháng tiêu thụ mặc định 10/2026, tháng hiện tại 11/2026

  it('parseStartMonth nhận tháng mặc định và tháng hiện tại', () => {
    expect(parseStartMonth('2026-10', now)).toEqual({ year: 2026, month: 10 })
    expect(parseStartMonth('2026-11', now)).toEqual({ year: 2026, month: 11 })
  })

  it('parseStartMonth từ chối tháng cũ hơn, tháng chưa tới, và chuỗi sai dạng', () => {
    for (const raw of ['2026-09', '2026-12', '2026-13', '2026-1', 'abc', '', undefined]) {
      expect(parseStartMonth(raw, now)).toBeNull()
    }
  })

  it('parseStartMonth: qua năm (tháng 1 → bắt đầu được từ 12 năm trước hoặc 1 năm nay)', () => {
    const jan = new Date('2027-01-05T03:00:00Z')
    expect(parseStartMonth('2026-12', jan)).toEqual({ year: 2026, month: 12 })
    expect(parseStartMonth('2027-01', jan)).toEqual({ year: 2027, month: 1 })
    expect(parseStartMonth('2026-11', jan)).toBeNull()
  })

  it('startMonthLink dạng YYYY-MM, khớp parseStartMonth', () => {
    expect(startMonthParam({ year: 2026, month: 11 })).toBe('2026-11')
    expect(startMonthParam({ year: 2026, month: 5 })).toBe('2026-05')
  })

  it('startNeighbors: tháng mặc định chỉ đi tiếp được, tháng hiện tại chỉ lùi được', () => {
    expect(startNeighbors({ year: 2026, month: 10 }, now)).toEqual({ older: null, newer: { year: 2026, month: 11 } })
    expect(startNeighbors({ year: 2026, month: 11 }, now)).toEqual({ older: { year: 2026, month: 10 }, newer: null })
  })
})
