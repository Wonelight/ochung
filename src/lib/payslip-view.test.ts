import { describe, expect, it } from 'vitest'
import type { PaymentStatus, Payslip, PayslipLine } from './billing/types'
import { advancedItems, billsLinkFor, groupLines, lineDetail, settlement, visibleLines } from './payslip-view'

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

  it('nhóm theo Khoản cố định / Điện nước theo ngày ở / Chi lẻ, bỏ nhóm rỗng', () => {
    const groups = groupLines(lines)
    expect(groups.map((g) => g.title)).toEqual(['Khoản cố định', 'Điện nước theo ngày ở', 'Chi lẻ'])
    expect(groups[0].lines.map((l) => l.key)).toEqual(['item:nha'])
    expect(groupLines([line('item:nha', 'fixed', 5)]).map((g) => g.group)).toEqual(['fixed'])
  })

  it('mỗi nhóm có tổng các dòng của nhóm (hiện cạnh tiêu đề nhóm)', () => {
    const groups = groupLines([...lines, line('item:dv', 'fixed', 300_000), line('water', 'utility', 45_000)])
    expect(groups.map((g) => [g.group, g.total])).toEqual([
      ['fixed', 2_300_000],
      ['utility', 45_000],
      ['expense', 80_000],
    ])
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

describe('lineDetail: câu điện nước của tháng đã chốt được viết lại', () => {
  const ym = { year: 2026, month: 10 }
  const util = (detail: string) => lineDetail(line('electricity', 'utility', 1, detail), ym, new Map())

  it('dạng "ngày-người" và "ngày ở" cũ → "Ở d/N ngày của cả nhà · tổng X"', () => {
    expect(util('462.024 ÷ 113 ngày-người × 20')).toBe('Ở 20/113 ngày của cả nhà · tổng 462.024')
    expect(util('111.564 ÷ 120 ngày ở × 30')).toBe('Ở 30/120 ngày của cả nhà · tổng 111.564')
  })

  it('dạng mới và chia đều (tổng ngày = 0) giữ nguyên', () => {
    expect(util('Ở 30/120 ngày của cả nhà · tổng 111.564')).toBe('Ở 30/120 ngày của cả nhà · tổng 111.564')
    expect(util('1.000.000 ÷ 4')).toBe('1.000.000 ÷ 4')
  })
})

describe('billsLinkFor (lối sang màn Hóa đơn trên phiếu)', () => {
  const base = { isOwner: true, self: false, closed: true, archived: false, inCurrentHouse: true, periodId: 'p1' }
  const st = (kind: PaymentStatus['kind']): PaymentStatus => ({ kind, balance: 1, confirmedIn: 0, confirmedOut: 0 })

  it('chủ nhà xem phiếu chưa xong của người khác: có nút, nhãn theo trạng thái', () => {
    expect(billsLinkFor({ ...base, status: st('pending') })).toEqual({ href: '/bills?period=p1', label: 'Xác nhận ở Hóa đơn' })
    expect(billsLinkFor({ ...base, status: st('partial') })).toEqual({ href: '/bills?period=p1', label: 'Ghi thanh toán ở Hóa đơn' })
  })

  it('không có nút khi đã trả, nháp, phiếu của mình, không phải chủ nhà', () => {
    expect(billsLinkFor({ ...base, status: st('paid') })).toBeNull()
    expect(billsLinkFor({ ...base, closed: false, status: undefined })).toBeNull()
    expect(billsLinkFor({ ...base, self: true, status: st('unpaid') })).toBeNull()
    expect(billsLinkFor({ ...base, isOwner: false, status: st('unpaid') })).toBeNull()
  })

  it('không có nút khi nhà đã lưu trữ hoặc tháng thuộc nhà khác nhà đang chọn (Hóa đơn sẽ mở sai nhà / không thao tác được)', () => {
    expect(billsLinkFor({ ...base, archived: true, status: st('unpaid') })).toBeNull()
    expect(billsLinkFor({ ...base, inCurrentHouse: false, status: st('unpaid') })).toBeNull()
  })
})

describe('advancedItems (các khoản người đó đã ứng)', () => {
  const exp = (id: string, paidByMemberId: string, description: string, amount: number, spentOn: string) => ({
    id,
    paidByMemberId,
    description,
    amount,
    spentOn,
  })

  it('chỉ lấy khoản người đó trả, theo thứ tự, ghi ngày/tháng', () => {
    const list = [
      exp('e1', 'dung', 'Máy lọc nước', 1_200_000, '2026-10-20'),
      exp('e2', 'an', 'Nước giặt', 10_000, '2026-10-11'),
      exp('e3', 'dung', 'Bóng đèn', 50_000, '2026-10-05'),
    ]
    expect(advancedItems('dung', list)).toEqual([
      { key: 'e1', label: 'Máy lọc nước · 20/10', amount: 1_200_000 },
      { key: 'e3', label: 'Bóng đèn · 5/10', amount: 50_000 },
    ])
    expect(advancedItems('chi', list)).toEqual([])
  })
})

describe('settlement (khối cuối phiếu)', () => {
  const slip = (share: number, advanced: number, due: number | null): Payslip => ({ memberId: 'm', lines: [], share, advanced, due })
  const closed = { draft: false }
  const st = (kind: PaymentStatus['kind'], balance: number, confirmedIn: number, confirmedOut: number): PaymentStatus => ({
    kind,
    balance,
    confirmedIn,
    confirmedOut,
  })

  it('thành viên tự xem: tổng phần, trừ tiền đã ứng, cần chuyển cho chủ nhà', () => {
    expect(settlement(slip(2_800_000, 200_000, 2_600_000), { self: true, name: 'An', ownerName: 'Linh' }, closed)).toEqual({
      rows: [
        { label: 'Tổng phần của bạn', amount: 2_800_000 },
        { label: 'Trừ tiền đã ứng', amount: -200_000 },
      ],
      final: { label: 'Cần chuyển cho Linh', amount: 2_600_000, muted: false },
    })
  })

  it('cần chuyển âm → "Chủ nhà cần trả lại bạn X đ"', () => {
    expect(settlement(slip(0, 300_000, -300_000), { self: true, name: 'An', ownerName: 'Linh' }, closed).final).toEqual({
      label: 'Chủ nhà cần trả lại bạn',
      amount: 300_000,
      muted: false,
    })
  })

  it('chủ nhà xem phiếu người khác: ghi theo tên người đó', () => {
    const s = settlement(slip(2_680_000, 0, 2_680_000), { self: false, name: 'Bình', ownerName: 'Linh' }, closed)
    expect(s.rows[0].label).toBe('Tổng phần của Bình')
    expect(s.final).toEqual({ label: 'Bình cần chuyển cho bạn', amount: 2_680_000, muted: false })
    expect(settlement(slip(0, 50_000, -50_000), { self: false, name: 'Bình', ownerName: 'Linh' }, closed).final.label).toBe(
      'Bạn cần trả lại Bình',
    )
  })

  it('phiếu chủ nhà: chỉ "Phần của bạn", không có dòng cần chuyển', () => {
    expect(settlement(slip(2_800_000, 120_000, null), { self: true, name: 'Linh', ownerName: 'Linh' }, closed)).toEqual({
      rows: [],
      final: { label: 'Phần của bạn', amount: 2_800_000, muted: false },
    })
  })

  it('không ứng tiền: không có dòng "Trừ tiền đã ứng"', () => {
    expect(settlement(slip(2_680_000, 0, 2_680_000), { self: true, name: 'An', ownerName: 'Linh' }, closed).rows).toEqual([
      { label: 'Tổng phần của bạn', amount: 2_680_000 },
    ])
  })

  it('trả một phần: dòng "Đã chuyển", số chính là số còn thiếu', () => {
    const s = settlement(slip(1_963_788, 0, 1_963_788), { self: false, name: 'Chi', ownerName: 'Linh' }, {
      draft: false,
      status: st('partial', 981_894, 981_894, 0),
    })
    expect(s).toEqual({
      rows: [
        { label: 'Tổng phần của Chi', amount: 1_963_788 },
        { label: 'Đã chuyển', amount: -981_894 },
      ],
      final: { label: 'Chi còn thiếu', amount: 981_894, muted: false },
    })
    expect(
      settlement(slip(1_963_788, 0, 1_963_788), { self: true, name: 'Chi', ownerName: 'Linh' }, { draft: false, status: st('partial', 981_894, 981_894, 0) })
        .final.label,
    ).toBe('Bạn còn thiếu')
  })

  it('chưa trả đồng nào: vẫn là "Cần chuyển cho …"', () => {
    expect(
      settlement(slip(2_000_000, 0, 2_000_000), { self: true, name: 'An', ownerName: 'Linh' }, { draft: false, status: st('unpaid', 2_000_000, 0, 0) }),
    ).toEqual({ rows: [{ label: 'Tổng phần của bạn', amount: 2_000_000 }], final: { label: 'Cần chuyển cho Linh', amount: 2_000_000, muted: false } })
  })

  it('đã thanh toán đủ: không còn số phải chuyển', () => {
    const s = settlement(slip(2_653_698, 0, 2_653_698), { self: false, name: 'An', ownerName: 'Linh' }, {
      draft: false,
      status: st('paid', 0, 2_653_698, 0),
    })
    expect(s.final).toEqual({ label: 'An đã thanh toán đủ', amount: null, muted: true })
    expect(s.rows.at(-1)).toEqual({ label: 'Đã chuyển', amount: -2_653_698 })
    expect(
      settlement(slip(2_653_698, 0, 2_653_698), { self: true, name: 'An', ownerName: 'Linh' }, { draft: false, status: st('paid', 0, 2_653_698, 0) })
        .final.label,
    ).toBe('Bạn đã thanh toán đủ')
  })

  it('còn 0 vì chủ nhà đã trả lại đủ: không ghi "đã thanh toán đủ"', () => {
    const who = { self: false, name: 'Dũng', ownerName: 'Linh' }
    const opts = { draft: false, status: st('paid', 0, 0, 1_200_000) }
    expect(settlement(slip(0, 1_200_000, -1_200_000), who, opts).final).toEqual({ label: 'Bạn đã trả lại Dũng đủ', amount: null, muted: true })
    expect(settlement(slip(0, 1_200_000, -1_200_000), { ...who, self: true }, opts).final.label).toBe('Chủ nhà đã trả lại bạn đủ')
  })

  it('phiếu 0 đ (phần bằng tiền đã ứng, không ai chuyển gì): "không cần chuyển khoản nào"', () => {
    const opts = { draft: false, status: st('paid', 0, 0, 0) }
    expect(settlement(slip(200_000, 200_000, 0), { self: true, name: 'An', ownerName: 'Linh' }, opts).final).toEqual({
      label: 'Bạn không cần chuyển khoản nào',
      amount: null,
      muted: true,
    })
    expect(settlement(slip(200_000, 200_000, 0), { self: false, name: 'An', ownerName: 'Linh' }, opts).final.label).toBe('An không cần chuyển khoản nào')
  })

  it('người rời nhà chỉ còn tiền đã ứng, chủ nhà trả lại một phần', () => {
    const advanced = [{ key: 'e9', label: 'Máy lọc nước · 20/10', amount: 1_200_000 }]
    const s = settlement(slip(0, 1_200_000, -1_200_000), { self: false, name: 'Dũng', ownerName: 'Linh' }, {
      draft: false,
      status: st('owner_owes', -700_000, 0, 500_000),
      advanced,
    })
    expect(s).toEqual({
      rows: [
        { label: 'Tổng phần của Dũng', amount: 0 },
        { label: 'Trừ tiền đã ứng', amount: -1_200_000, items: advanced },
        { label: 'Chủ nhà đã trả lại', amount: 500_000 },
      ],
      final: { label: 'Bạn cần trả lại Dũng', amount: 700_000, muted: false },
    })
  })

  it('trả dư: chủ nhà cần trả lại phần dư', () => {
    const s = settlement(slip(2_500_000, 0, 2_500_000), { self: true, name: 'An', ownerName: 'Linh' }, {
      draft: false,
      status: st('owner_owes', -100_000, 2_600_000, 0),
    })
    expect(s.final).toEqual({ label: 'Chủ nhà cần trả lại bạn', amount: 100_000, muted: false })
  })

  it('tháng nháp: "Dự kiến…", không tô màu', () => {
    expect(settlement(slip(2_233_016, 0, 2_233_016), { self: true, name: 'Chi', ownerName: 'Linh' }, { draft: true }).final).toEqual({
      label: 'Dự kiến cần chuyển cho Linh',
      amount: 2_233_016,
      muted: true,
    })
    expect(settlement(slip(2_203_016, 0, 2_203_016), { self: false, name: 'An', ownerName: 'Linh' }, { draft: true }).final.label).toBe(
      'An dự kiến cần chuyển cho bạn',
    )
    expect(settlement(slip(0, 50_000, -50_000), { self: false, name: 'Bình', ownerName: 'Linh' }, { draft: true }).final).toEqual({
      label: 'Bạn dự kiến trả lại Bình',
      amount: 50_000,
      muted: true,
    })
    expect(settlement(slip(0, 50_000, -50_000), { self: true, name: 'Bình', ownerName: 'Linh' }, { draft: true }).final.label).toBe(
      'Chủ nhà dự kiến trả lại bạn',
    )
  })
})
