import { describe, expect, it } from 'vitest'
import type { Payslip } from './billing/types'
import { billFilterOf, collectionSummary, memberBalance, paymentRows, pillFor, statusesFor } from './payments-view'

const slip = (memberId: string, due: number | null): Payslip => ({ memberId, lines: [], share: 0, advanced: 0, due })

describe('statusesFor', () => {
  it('chưa có bản ghi → trạng thái tính từ số cần chuyển; chủ nhà không có trạng thái', () => {
    const s = statusesFor([slip('linh', null), slip('an', 2_600_000), slip('binh', 0), slip('chi', -50_000)], {})
    expect(Object.keys(s)).toEqual(['an', 'binh', 'chi'])
    expect(s.an.kind).toBe('unpaid')
    expect(s.binh.kind).toBe('paid')
    expect(s.chi.kind).toBe('owner_owes')
  })

  it('dùng bản ghi của từng người', () => {
    const s = statusesFor([slip('an', 2_600_000)], { an: [{ direction: 'in', amount: 1_000_000, status: 'confirmed' }] })
    expect(s.an).toMatchObject({ kind: 'partial', balance: 1_600_000 })
  })
})

describe('billFilterOf', () => {
  it('"Còn thiếu" và "Chủ nhà nợ" gộp vào Chưa trả', () => {
    expect(billFilterOf('paid')).toBe('paid')
    expect(billFilterOf('pending')).toBe('pending')
    expect(billFilterOf('unpaid')).toBe('unpaid')
    expect(billFilterOf('partial')).toBe('unpaid')
    expect(billFilterOf('owner_owes')).toBe('unpaid')
  })
})

describe('collectionSummary', () => {
  it('tiến độ thu của chủ nhà: chỉ tính người phải chuyển, không tính chủ nhà', () => {
    const slips = [slip('linh', null), slip('an', 2_600_000), slip('binh', 2_680_000), slip('chi', 2_575_000)]
    const statuses = statusesFor(slips, { an: [{ direction: 'in', amount: 2_600_000, status: 'confirmed' }] })
    expect(collectionSummary(slips, statuses)).toEqual({ collected: 2_600_000, expected: 7_855_000, paidCount: 1, payerCount: 3 })
  })
})

describe('pillFor', () => {
  it('chữ trên nhãn trạng thái', () => {
    expect(pillFor({ kind: 'paid', balance: 0, confirmedIn: 0, confirmedOut: 0 })).toEqual({ tone: 'paid', text: 'Đã trả' })
    expect(pillFor({ kind: 'pending', balance: 5, confirmedIn: 0, confirmedOut: 0 })).toEqual({ tone: 'pending', text: 'Chờ xác nhận' })
    expect(pillFor({ kind: 'unpaid', balance: 5, confirmedIn: 0, confirmedOut: 0 })).toEqual({ tone: 'unpaid', text: 'Chưa trả' })
    expect(pillFor({ kind: 'partial', balance: 600_000, confirmedIn: 2_000_000, confirmedOut: 0 })).toEqual({
      tone: 'unpaid',
      text: 'Còn thiếu 600.000 đ',
    })
    expect(pillFor({ kind: 'owner_owes', balance: -300_000, confirmedIn: 0, confirmedOut: 0 })).toEqual({
      tone: 'unpaid',
      text: 'Chủ nhà nợ 300.000 đ',
    })
  })
})

describe('paymentRows', () => {
  const names = new Map([
    ['linh', 'Linh'],
    ['an', 'An'],
    ['binh', 'Bình'],
    ['chi', 'Chi'],
  ])
  const slips: Payslip[] = [
    { memberId: 'linh', lines: [], share: 2_800_000, advanced: 120_000, due: null },
    { memberId: 'an', lines: [], share: 2_800_000, advanced: 200_000, due: 2_600_000 },
    { memberId: 'binh', lines: [], share: 0, advanced: 300_000, due: -300_000 },
  ]
  const now = new Date('2026-12-08T03:00:00Z')

  it('hạt giống ảnh đại diện lấy từ bảng seeds (tên hiện tại + biến thể), thiếu thì dùng tên', () => {
    const rows = paymentRows({
      status: 'closed',
      dueDate: '2026-12-10',
      payslips: slips,
      names,
      seeds: { an: 'An Mới#2' },
      statuses: statusesFor(slips, {}),
      now,
    })
    expect(rows.map((r) => r.avatarSeed)).toEqual(['Linh', 'An Mới#2', 'Bình'])
  })

  it('tháng đã chốt: số tiền riêng từng người, nhãn trạng thái, nhóm lọc; chủ nhà không có nhãn', () => {
    const rows = paymentRows({ status: 'closed', dueDate: '2026-12-10', payslips: slips, names, statuses: statusesFor(slips, {}), now })
    expect(rows).toEqual([
      { memberId: 'linh', name: 'Linh', avatarSeed: 'Linh', isOwner: true, note: 'Chủ nhà', amount: 2_800_000, pill: null, filter: null },
      { memberId: 'an', name: 'An', avatarSeed: 'An', isOwner: false, note: 'Hạn 10/12 · còn 2 ngày', amount: 2_600_000, pill: { tone: 'unpaid', text: 'Chưa trả' }, filter: 'unpaid' },
      {
        memberId: 'binh',
        name: 'Bình',
        avatarSeed: 'Bình',
        isOwner: false,
        note: 'Chủ nhà cần trả lại',
        amount: 300_000,
        pill: { tone: 'unpaid', text: 'Chủ nhà nợ 300.000 đ' },
        filter: 'unpaid',
      },
    ])
  })

  it('tháng nháp: chưa có trạng thái', () => {
    const rows = paymentRows({ status: 'draft', dueDate: '2026-12-10', payslips: slips, names, statuses: {}, now })
    expect(rows.map((r) => [r.note, r.amount, r.pill, r.filter])).toEqual([
      ['Chủ nhà', 2_800_000, null, null],
      ['Đã ứng 200.000 đ', 2_600_000, null, null],
      ['Chủ nhà cần trả lại', 300_000, null, null],
    ])
  })
})

describe('memberBalance (ô đầu Trang chủ của thành viên)', () => {
  const st = (due: number, records: { direction: 'in' | 'out'; amount: number; status: 'pending' | 'confirmed' | 'rejected' }[]) =>
    statusesFor([slip('an', due)], { an: records }).an

  it('tháng nháp (chưa có trạng thái): theo số cần chuyển của phiếu', () => {
    expect(memberBalance(slip('an', 2_600_000), undefined)).toEqual({ text: 'Bạn cần chuyển', amount: 2_600_000, original: null })
    expect(memberBalance(slip('an', -50_000), undefined)).toEqual({ text: 'Chủ nhà cần trả lại bạn', amount: 50_000, original: null })
  })

  it('chưa trả gì: cần chuyển nguyên số; trả một phần: còn thiếu, kèm số của phiếu', () => {
    expect(memberBalance(slip('an', 2_600_000), st(2_600_000, []))).toEqual({ text: 'Bạn cần chuyển', amount: 2_600_000, original: null })
    expect(memberBalance(slip('an', 2_600_000), st(2_600_000, [{ direction: 'in', amount: 1_000_000, status: 'confirmed' }]))).toEqual({
      text: 'Bạn còn thiếu',
      amount: 1_600_000,
      original: 2_600_000,
    })
  })

  it('đã trả đủ: không còn hiện "cần chuyển" mà là "đã trả đủ X"', () => {
    expect(memberBalance(slip('an', 2_600_000), st(2_600_000, [{ direction: 'in', amount: 2_600_000, status: 'confirmed' }]))).toEqual({
      text: 'Bạn đã trả đủ',
      amount: 2_600_000,
      original: null,
    })
  })

  it('chủ nhà nợ: số còn phải trả lại; trả lại xong thì "chủ nhà đã trả lại bạn X"', () => {
    expect(memberBalance(slip('an', -50_000), st(-50_000, []))).toEqual({ text: 'Chủ nhà cần trả lại bạn', amount: 50_000, original: null })
    expect(memberBalance(slip('an', -50_000), st(-50_000, [{ direction: 'out', amount: 50_000, status: 'confirmed' }]))).toEqual({
      text: 'Chủ nhà đã trả lại bạn',
      amount: 50_000,
      original: null,
    })
    // sửa sau chốt làm số giảm dưới số đã trả
    expect(memberBalance(slip('an', 2_500_000), st(2_500_000, [{ direction: 'in', amount: 2_600_000, status: 'confirmed' }]))).toEqual({
      text: 'Chủ nhà cần trả lại bạn',
      amount: 100_000,
      original: 2_500_000,
    })
  })

  it('phiếu 0 đ, chưa có bản ghi nào: không cần chuyển', () => {
    expect(memberBalance(slip('an', 0), st(0, []))).toEqual({ text: 'Bạn không cần chuyển khoản nào', amount: null, original: null })
  })
})
