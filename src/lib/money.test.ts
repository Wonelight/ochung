import { describe, expect, it } from 'vitest'
import { formatVnd, parseVnd } from './money'

describe('formatVnd', () => {
  it('định dạng dấu chấm phân cách nghìn', () => {
    expect(formatVnd(2600000)).toBe('2.600.000')
    expect(formatVnd(0)).toBe('0')
    expect(formatVnd(-171428)).toBe('-171.428')
  })

  it('không thêm dấu chấm cho số dưới 1000', () => {
    expect(formatVnd(999)).toBe('999')
    expect(formatVnd(1000)).toBe('1.000')
    expect(formatVnd(-5)).toBe('-5')
  })
})

describe('parseVnd', () => {
  it('đọc số có dấu chấm và hậu tố đ', () => {
    expect(parseVnd('2.600.000')).toBe(2600000)
    expect(parseVnd('2600000đ')).toBe(2600000)
    expect(parseVnd(' 2.600.000 đ ')).toBe(2600000)
    expect(parseVnd('0')).toBe(0)
  })

  it('đọc số âm', () => {
    expect(parseVnd('-171.428')).toBe(-171428)
  })

  it('từ chối đầu vào không hợp lệ', () => {
    expect(parseVnd('abc')).toBeNull()
    expect(parseVnd('')).toBeNull()
    expect(parseVnd('đ')).toBeNull()
    expect(parseVnd('1,5')).toBeNull() // không chấp nhận số lẻ
    expect(parseVnd('1.5')).toBeNull() // dấu chấm phải phân cách nhóm 3 chữ số
    expect(parseVnd('12.34.567')).toBeNull()
  })
})
