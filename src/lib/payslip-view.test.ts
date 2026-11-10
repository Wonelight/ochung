import { describe, expect, it } from 'vitest'
import type { Payslip, PayslipLine } from './billing/types'
import { groupLines, lineDetail, settlement, visibleLines } from './payslip-view'

const line = (key: string, group: PayslipLine['group'], amount: number, detail = ''): PayslipLine => ({
  key,
  group,
  label: key,
  detail,
  amount,
})

describe('visibleLines / groupLines', () => {
  const lines = [
    line('item:nha', 'fixed', 2_000_000),
    line('item:xe', 'fixed', 0),
    line('electricity', 'utility', 0, '1.260.000 ÷ 105 ngày-người × 0'),
    line('water', 'utility', 0),
    line('expense:a', 'expense', 0),
    line('expense:b', 'expense', 80_000),
  ]

  it('ẩn dòng 0 đ, trừ điện và nước (vẫn hiện để thấy số ngày ở)', () => {
    expect(visibleLines(lines).map((l) => l.key)).toEqual(['item:nha', 'electricity', 'water', 'expense:b'])
  })

  it('nhóm theo Khoản cố định / Điện nước theo ngày ở / Chi phát sinh, bỏ nhóm rỗng', () => {
    const groups = groupLines(lines)
    expect(groups.map((g) => g.title)).toEqual(['Khoản cố định', 'Điện nước theo ngày ở', 'Chi phát sinh'])
    expect(groups[0].lines.map((l) => l.key)).toEqual(['item:nha'])
    expect(groupLines([line('item:nha', 'fixed', 5)]).map((g) => g.group)).toEqual(['fixed'])
  })
})

describe('lineDetail', () => {
  const ym = { year: 2026, month: 12 }
  const spentOn = new Map([
    ['a', '2026-11-28'],
    ['b', '2026-12-03'],
  ])

  it('khoản chi lẻ của tháng đã chốt được chuyển sang tháng này → ghi "tính vào T12"', () => {
    expect(lineDetail(line('expense:a', 'expense', 1, 'An trả 200.000 · 28/11'), ym, spentOn)).toBe(
      'An trả 200.000 · 28/11, tính vào T12',
    )
  })

  it('khoản chi đúng tháng và các dòng khác giữ nguyên', () => {
    expect(lineDetail(line('expense:b', 'expense', 1, 'Linh trả 120.000 · 3/12'), ym, spentOn)).toBe('Linh trả 120.000 · 3/12')
    expect(lineDetail(line('item:nha', 'fixed', 1, '8.000.000 ÷ 4'), ym, spentOn)).toBe('8.000.000 ÷ 4')
  })
})

describe('settlement (khối cuối phiếu)', () => {
  const slip = (share: number, advanced: number, due: number | null): Payslip => ({ memberId: 'm', lines: [], share, advanced, due })

  it('thành viên tự xem: tổng phần, trừ tiền đã ứng, cần chuyển cho chủ nhà', () => {
    expect(settlement(slip(2_800_000, 200_000, 2_600_000), { self: true, name: 'An', ownerName: 'Linh' })).toEqual({
      rows: [
        { label: 'Tổng phần của bạn', amount: 2_800_000 },
        { label: 'Trừ tiền đã ứng', amount: -200_000 },
      ],
      final: { label: 'Cần chuyển cho Linh', amount: 2_600_000, refund: false },
    })
  })

  it('cần chuyển âm → "Chủ nhà cần trả lại bạn X đ"', () => {
    expect(settlement(slip(0, 300_000, -300_000), { self: true, name: 'An', ownerName: 'Linh' }).final).toEqual({
      label: 'Chủ nhà cần trả lại bạn',
      amount: 300_000,
      refund: true,
    })
  })

  it('chủ nhà xem phiếu người khác: ghi theo tên người đó', () => {
    const s = settlement(slip(2_680_000, 0, 2_680_000), { self: false, name: 'Bình', ownerName: 'Linh' })
    expect(s.rows[0].label).toBe('Tổng phần của Bình')
    expect(s.final).toEqual({ label: 'Bình cần chuyển cho bạn', amount: 2_680_000, refund: false })
    expect(settlement(slip(0, 50_000, -50_000), { self: false, name: 'Bình', ownerName: 'Linh' }).final.label).toBe(
      'Bạn cần trả lại Bình',
    )
  })

  it('phiếu chủ nhà: chỉ "Phần của bạn", không có dòng cần chuyển', () => {
    expect(settlement(slip(2_800_000, 120_000, null), { self: true, name: 'Linh', ownerName: 'Linh' })).toEqual({
      rows: [],
      final: { label: 'Phần của bạn', amount: 2_800_000, refund: false },
    })
  })
})
