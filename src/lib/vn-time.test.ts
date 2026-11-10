import { describe, expect, it } from 'vitest'
import { dateVn, dayMonth, dueNote, greetingVi, todayVn } from './vn-time'

// 17:00 UTC = 00:00 hôm sau ở Việt Nam (UTC+7)
describe('giờ Việt Nam', () => {
  it('todayVn lấy ngày theo giờ Việt Nam, không theo UTC', () => {
    expect(todayVn(new Date('2026-11-27T16:59:00Z'))).toBe('2026-11-27')
    expect(todayVn(new Date('2026-11-27T17:00:00Z'))).toBe('2026-11-28')
    expect(todayVn(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01-01')
  })

  it('dateVn ra dd/mm theo giờ Việt Nam', () => {
    expect(dateVn(new Date('2026-11-30T18:30:00Z'))).toBe('01/12')
  })

  it('dayMonth: YYYY-MM-DD → dd/mm', () => {
    expect(dayMonth('2026-12-10')).toBe('10/12')
    expect(dayMonth('2026-11-02')).toBe('02/11')
  })

  it.each([
    ['2026-11-10T00:00:00Z', 'Chào buổi sáng'], // 07:00
    ['2026-11-10T04:30:00Z', 'Chào buổi trưa'], // 11:30
    ['2026-11-10T08:00:00Z', 'Chào buổi chiều'], // 15:00
    ['2026-11-10T13:00:00Z', 'Chào buổi tối'], // 20:00
    ['2026-11-10T19:00:00Z', 'Chào buổi tối'], // 02:00
    ['2026-11-09T21:00:00Z', 'Chào buổi sáng'], // 04:00
  ])('greetingVi(%s) = %s', (iso, text) => {
    expect(greetingVi(new Date(iso))).toBe(text)
  })

  it('dueNote đếm ngày theo lịch Việt Nam', () => {
    const now = new Date('2026-12-08T20:00:00Z') // 03:00 ngày 09/12 ở VN
    expect(dueNote('2026-12-10', now)).toBe('Hạn 10/12 · còn 1 ngày')
    expect(dueNote('2026-12-12', now)).toBe('Hạn 12/12 · còn 3 ngày')
    expect(dueNote('2026-12-09', now)).toBe('Hạn hôm nay 09/12')
    expect(dueNote('2026-12-07', now)).toBe('Quá hạn 2 ngày · hạn 07/12')
  })
})
