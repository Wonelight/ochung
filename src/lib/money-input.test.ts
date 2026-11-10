import { describe, expect, it } from 'vitest'
import { caretAfterDigits, readMoneyInput, showMoneyInput } from './money-input'

describe('ô nhập tiền', () => {
  it('gõ liên tục có phân cách nghìn', () => {
    let text = ''
    for (const ch of '2600000') text = showMoneyInput(readMoneyInput(text + ch))
    expect(text).toBe('2.600.000')
  })
  it('xóa một chữ số khỏi chuỗi đã có dấu chấm', () => {
    expect(showMoneyInput(readMoneyInput('2.600.00'))).toBe('260.000')
  })
  it('bỏ chữ cái, bỏ phần thập phân, bỏ số 0 đầu', () => {
    expect(readMoneyInput('abc')).toBeNull()
    expect(readMoneyInput('1,5')).toBe(1)
    expect(readMoneyInput('1.234,99')).toBe(1234)
    expect(readMoneyInput('0012')).toBe(12)
    expect(readMoneyInput('0')).toBe(0)
    expect(readMoneyInput('')).toBeNull()
  })
  it('giới hạn 11 chữ số', () => {
    expect(readMoneyInput('1234567890123')).toBe(12_345_678_901)
  })
  it('đặt con trỏ theo số chữ số', () => {
    expect(caretAfterDigits('2.600.000', 0)).toBe(0)
    expect(caretAfterDigits('2.600.000', 1)).toBe(1)
    expect(caretAfterDigits('2.600.000', 2)).toBe(3)
    expect(caretAfterDigits('2.600.000', 7)).toBe(9)
    expect(caretAfterDigits('2.600.000', 20)).toBe(9)
  })
})
