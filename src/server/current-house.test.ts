import { describe, expect, it } from 'vitest'
import type { HouseSummary } from './houses'
import { resolveCurrentHouse, visibleHouses } from './current-house'

const h = (houseId: string, archived = false, former = false): HouseSummary => ({ houseId, name: houseId, role: 'member', archived, former })

describe('resolveCurrentHouse', () => {
  const list = [h('a'), h('b'), h('old', true)]

  it('dùng nhà trong cookie nếu là thành viên', () => {
    expect(resolveCurrentHouse(list, 'b')?.houseId).toBe('b')
  })
  it('nhà đã xóa (lưu trữ) không bao giờ là nhà đang chọn, kể cả còn trong cookie → nhà đang dùng đầu tiên', () => {
    expect(resolveCurrentHouse(list, 'old')?.houseId).toBe('a')
  })
  it('cookie thiếu hoặc không hợp lệ → nhà đang dùng đầu tiên', () => {
    expect(resolveCurrentHouse(list, undefined)?.houseId).toBe('a')
    expect(resolveCurrentHouse(list, 'khong-phai-nha-cua-toi')?.houseId).toBe('a')
  })
  it('chỉ có nhà đã lưu trữ mà không chọn → null', () => {
    expect(resolveCurrentHouse([h('old', true)], undefined)).toBeNull()
  })
  it('nhà đã rời: chọn được để xem lịch sử, nhưng không bao giờ là nhà mặc định', () => {
    const withLeft = [h('left', false, true), h('a')]
    expect(resolveCurrentHouse(withLeft, 'left')?.houseId).toBe('left')
    expect(resolveCurrentHouse(withLeft, undefined)?.houseId).toBe('a')
    expect(resolveCurrentHouse([h('left', false, true)], undefined)).toBeNull()
  })
  it('không có nhà → null', () => {
    expect(resolveCurrentHouse([], 'x')).toBeNull()
  })
})

describe('visibleHouses (danh sách nhà trên giao diện)', () => {
  it('bỏ nhà đã xóa (lưu trữ); giữ nhà đang dùng và nhà đã rời, đúng thứ tự', () => {
    expect(visibleHouses([h('a'), h('old', true), h('left', false, true), h('b')]).map((x) => x.houseId)).toEqual(['a', 'left', 'b'])
  })
})
