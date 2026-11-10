import { describe, expect, it } from 'vitest'
import { timeAgoVi } from './time-ago'

const now = new Date('2026-11-10T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

describe('timeAgoVi', () => {
  it('chọn đơn vị theo khoảng thời gian', () => {
    expect(timeAgoVi(ago(10_000), now)).toBe('vừa xong')
    expect(timeAgoVi(ago(5 * 60_000), now)).toBe('5 phút trước')
    expect(timeAgoVi(ago(2 * 3_600_000 + 1), now)).toBe('2 giờ trước')
    expect(timeAgoVi(ago(30 * 3_600_000), now)).toBe('hôm qua')
    expect(timeAgoVi(ago(3 * 86_400_000), now)).toBe('3 ngày trước')
  })
  it('thời điểm ở tương lai (lệch đồng hồ) coi như vừa xong', () => {
    expect(timeAgoVi(new Date(now.getTime() + 5000), now)).toBe('vừa xong')
  })
})
