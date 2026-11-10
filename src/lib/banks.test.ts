import { describe, expect, it } from 'vitest'
import { BANKS, findBank, normalizeAccountName } from './banks'

describe('danh sách ngân hàng', () => {
  it('BIN gồm 6 chữ số và không trùng', () => {
    expect(BANKS.every((b) => /^\d{6}$/.test(b.bin))).toBe(true)
    expect(new Set(BANKS.map((b) => b.bin)).size).toBe(BANKS.length)
    expect(new Set(BANKS.map((b) => b.short)).size).toBe(BANKS.length)
  })
  it('có các ngân hàng phổ biến', () => {
    expect(findBank('970436')?.short).toBe('Vietcombank')
    expect(findBank('970422')?.short).toBe('MB')
    expect(findBank('546034')?.short).toBe('Cake')
    expect(findBank('963388')?.short).toBe('Timo')
    expect(findBank('000000')).toBeUndefined()
    expect(BANKS.length).toBeGreaterThanOrEqual(25)
  })
  it('tên chủ tài khoản: hoa, bỏ dấu, đ -> D', () => {
    expect(normalizeAccountName('  Nguyễn  Thị Đào ')).toBe('NGUYEN THI DAO')
  })
})
