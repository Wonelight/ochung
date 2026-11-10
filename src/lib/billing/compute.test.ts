import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { computePeriod } from './compute'
import type { PeriodInput, PeriodMember, Tariff } from './types'

function member(id: string, over: Partial<PeriodMember> = {}): PeriodMember {
  return {
    memberId: id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    isOwner: false,
    included: true,
    days: 30,
    qty: {},
    ...over,
  }
}

function input(over: Partial<PeriodInput> = {}): PeriodInput {
  return {
    year: 2026,
    month: 11,
    daysInMonth: 30,
    members: [],
    items: [],
    electricity: null,
    water: null,
    expenses: [],
    ...over,
  }
}

const flatTariff: Tariff = {
  tiers: [{ upTo: null, price: 3500 }],
  perPerson: false,
  registeredPeople: 1,
  vatPct: 0,
  surcharges: [],
}

// Ví dụ chuẩn spec 5.4
const example: PeriodInput = input({
  members: [
    member('linh', { name: 'Linh', isOwner: true, qty: { xe: 1 } }),
    member('an', { name: 'An', qty: { xe: 1 } }),
    member('binh', { name: 'Bình', qty: { xe: 0 } }),
    member('chi', { name: 'Chi', days: 15, qty: { xe: 1 } }),
  ],
  items: [
    { id: 'nha', name: 'Tiền nhà', kind: 'equal', amount: 8_000_000, enabled: true },
    { id: 'dv', name: 'Phí dịch vụ', kind: 'equal', amount: 600_000, enabled: true },
    { id: 'xe', name: 'Tiền xe', kind: 'per_unit', amount: 120_000, enabled: true },
  ],
  electricity: { mode: 'total', total: 1_260_000 },
  water: { mode: 'total', total: 315_000 },
  expenses: [
    { id: 'e1', description: 'Nước giặt', amount: 200_000, paidByMemberId: 'an', spentOn: '2026-11-20' },
    { id: 'e2', description: 'Bóng đèn', amount: 120_000, paidByMemberId: 'linh', spentOn: '2026-11-05' },
  ],
})

function byId(r: ReturnType<typeof computePeriod>) {
  return Object.fromEntries(r.payslips.map((p) => [p.memberId, p]))
}

describe('computePeriod: ví dụ chuẩn spec 5.4', () => {
  const r = computePeriod(example)
  const by = byId(r)

  it('khớp từng phiếu', () => {
    expect(by.linh.share).toBe(2_800_000)
    expect(by.linh.due).toBeNull()
    expect(by.linh.advanced).toBe(120_000)
    expect(by.an.share).toBe(2_800_000)
    expect(by.an.advanced).toBe(200_000)
    expect(by.an.due).toBe(2_600_000)
    expect(by.binh.share).toBe(2_680_000)
    expect(by.binh.due).toBe(2_680_000)
    expect(by.chi.share).toBe(2_575_000)
    expect(by.chi.due).toBe(2_575_000)
  })

  it('grandTotal = Σ share = tổng chi', () => {
    expect(r.grandTotal).toBe(10_855_000)
    expect(r.payslips.reduce((s, p) => s + p.share, 0)).toBe(r.grandTotal)
  })

  it('dòng điện của Chi và không có dòng xe của Bình', () => {
    expect(by.chi.lines.find((l) => l.key === 'electricity')!.amount).toBe(180_000)
    expect(by.binh.lines.some((l) => l.key.startsWith('item:xe'))).toBe(false)
  })

  it('kết quả điện/nước dạng nhập tổng', () => {
    expect(r.electricity).toEqual({ total: 1_260_000 })
    expect(r.water).toEqual({ total: 315_000 })
  })

  it('key, nhóm, nhãn, chi tiết của các dòng', () => {
    expect(by.chi.lines.map((l) => [l.key, l.group, l.label])).toEqual([
      ['item:nha', 'fixed', 'Tiền nhà'],
      ['item:dv', 'fixed', 'Phí dịch vụ'],
      ['item:xe', 'fixed', 'Tiền xe'],
      ['electricity', 'utility', 'Điện'],
      ['water', 'utility', 'Nước'],
      ['expense:e1', 'expense', 'Nước giặt'],
      ['expense:e2', 'expense', 'Bóng đèn'],
    ])
    const line = (k: string) => by.chi.lines.find((l) => l.key === k)!
    expect(line('item:nha').detail).toBe('8.000.000 ÷ 4')
    expect(line('item:xe').detail).toBe('1 × 120.000')
    expect(line('electricity').detail).toBe('1.260.000 ÷ 105 ngày-người × 15')
    expect(line('water').detail).toBe('315.000 ÷ 105 ngày-người × 15')
    expect(line('expense:e1').detail).toBe('An trả 200.000 · 20/11')
    expect(line('expense:e2').detail).toBe('Linh trả 120.000 · 5/11')
    expect(line('expense:e1').amount).toBe(50_000)
  })

  it('tổng các dòng = share cho từng phiếu', () => {
    for (const p of r.payslips) {
      expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBe(p.share)
    }
  })
})

describe('computePeriod: trường hợp biên', () => {
  it('không làm tròn: 1.000.000 chia 3, người đầu được +1', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b'), member('c')],
        items: [{ id: 'nha', name: 'Nhà', kind: 'equal', amount: 1_000_000, enabled: true }],
      }),
    )
    expect(r.payslips.map((p) => p.share)).toEqual([333_334, 333_333, 333_333])
    expect(r.grandTotal).toBe(1_000_000)
  })

  it('Σ ngày = 0: chia đều, không throw', () => {
    const r = computePeriod(
      input({
        members: [member('a', { days: 0 }), member('b', { days: 0 })],
        electricity: { mode: 'total', total: 100_000 },
      }),
    )
    expect(r.payslips.map((p) => p.share)).toEqual([50_000, 50_000])
    expect(r.grandTotal).toBe(100_000)
  })

  it('người có days = 0 trong khi người khác có ngày thì không phải trả điện', () => {
    const r = computePeriod(
      input({
        members: [member('a', { days: 0 }), member('b')],
        electricity: { mode: 'total', total: 100_000 },
      }),
    )
    expect(r.payslips.map((p) => p.share)).toEqual([0, 100_000])
  })

  it('included=false: không có phiếu và M giảm', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b', { included: false }), member('c')],
        items: [{ id: 'nha', name: 'Nhà', kind: 'equal', amount: 1_000_000, enabled: true }],
      }),
    )
    expect(r.payslips.map((p) => p.memberId)).toEqual(['a', 'c'])
    expect(r.payslips.map((p) => p.share)).toEqual([500_000, 500_000])
    expect(r.payslips[0].lines[0].detail).toBe('1.000.000 ÷ 2')
  })

  it('included=false: ngày của người đó không vào Σd', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b', { included: false, days: 30 })],
        electricity: { mode: 'total', total: 90_000 },
      }),
    )
    expect(r.payslips.map((p) => p.share)).toEqual([90_000])
  })

  it('ứng nhiều hơn phần: due âm', () => {
    const r = computePeriod(
      input({
        members: [member('linh', { isOwner: true }), member('an', { name: 'An' })],
        expenses: [
          { id: 'e', description: 'Sửa máy', amount: 5_000_000, paidByMemberId: 'an', spentOn: '2026-11-01' },
        ],
      }),
    )
    const by = byId(r)
    expect(by.an.share).toBe(2_500_000)
    expect(by.an.due).toBe(-2_500_000)
  })

  it('item enabled=false: không có trong phiếu và grandTotal', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b')],
        items: [
          { id: 'nha', name: 'Nhà', kind: 'equal', amount: 1_000_000, enabled: true },
          { id: 'net', name: 'Net', kind: 'equal', amount: 300_000, enabled: false },
        ],
      }),
    )
    expect(r.grandTotal).toBe(1_000_000)
    for (const p of r.payslips) expect(p.lines.some((l) => l.key === 'item:net')).toBe(false)
  })

  it('điện null: không có dòng điện, kết quả null', () => {
    const r = computePeriod(
      input({ members: [member('a')], water: { mode: 'total', total: 10_000 } }),
    )
    expect(r.electricity).toBeNull()
    expect(r.water).toEqual({ total: 10_000 })
    expect(r.payslips[0].lines.map((l) => l.key)).toEqual(['water'])
  })

  it('theo bậc: prev 1238, curr 1398, 1 bậc 3.500 -> 560.000, usage 160', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b')],
        electricity: { mode: 'tiered', prev: 1238, curr: 1398, tariff: flatTariff },
      }),
    )
    expect(r.electricity!.total).toBe(560_000)
    expect(r.electricity!.usage).toBe(160)
    expect(r.electricity!.tariff!.total).toBe(560_000)
    expect(r.grandTotal).toBe(560_000)
    expect(r.payslips.map((p) => p.share)).toEqual([280_000, 280_000])
  })

  it('theo bậc: chỉ số giảm thì throw AppError', () => {
    expect(() =>
      computePeriod(
        input({
          members: [member('a')],
          electricity: { mode: 'tiered', prev: 10, curr: 5, tariff: flatTariff },
        }),
      ),
    ).toThrow(AppError)
  })

  it('per_unit: qty thiếu = 0 (không có dòng), qty 2 nhân đôi', () => {
    const r = computePeriod(
      input({
        members: [member('a', { qty: { xe: 2 } }), member('b')],
        items: [{ id: 'xe', name: 'Xe', kind: 'per_unit', amount: 100_000, enabled: true }],
      }),
    )
    const by = byId(r)
    expect(by.a.lines).toHaveLength(1)
    expect(by.a.lines[0]).toMatchObject({ amount: 200_000, detail: '2 × 100.000' })
    expect(by.b.lines).toHaveLength(0)
    expect(r.grandTotal).toBe(200_000)
  })

  it('mỗi khoản phát sinh là một dòng riêng, chia dư theo thứ tự thành viên', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b'), member('c')],
        expenses: [
          { id: 'e1', description: 'X', amount: 100, paidByMemberId: 'a', spentOn: '2026-11-01' },
          { id: 'e2', description: 'Y', amount: 100, paidByMemberId: 'b', spentOn: '2026-11-02' },
        ],
      }),
    )
    // mỗi khoản 100/3 = 34,33,33 -> người đầu +1 ở cả hai khoản
    expect(r.payslips[0].lines.map((l) => l.amount)).toEqual([34, 34])
    expect(r.payslips[1].lines.map((l) => l.amount)).toEqual([33, 33])
    expect(r.payslips.map((p) => p.share)).toEqual([68, 66, 66])
    expect(r.payslips.map((p) => p.advanced)).toEqual([100, 100, 0])
  })

  it('người trả không được tính tháng này: không có phiếu, khoản vẫn chia cho người còn lại', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b', { included: false })],
        expenses: [
          { id: 'e', description: 'X', amount: 100, paidByMemberId: 'b', spentOn: '2026-11-01' },
        ],
      }),
    )
    expect(r.payslips).toHaveLength(1)
    expect(r.payslips[0]).toMatchObject({ share: 100, advanced: 0, due: 100 })
    expect(r.grandTotal).toBe(100)
  })

  it('không ai được tính và không có khoản nào: phiếu rỗng, tổng 0', () => {
    const r = computePeriod(input({ members: [member('a', { included: false })] }))
    expect(r).toEqual({ electricity: null, water: null, grandTotal: 0, payslips: [] })
  })

  it('không ai được tính nhưng có khoản chi: throw NO_MEMBERS', () => {
    try {
      computePeriod(
        input({
          members: [member('a', { included: false })],
          items: [{ id: 'nha', name: 'Nhà', kind: 'equal', amount: 1, enabled: true }],
        }),
      )
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).reason).toBe('NO_MEMBERS')
      expect((e as AppError).code).toBe('INVALID')
    }
  })

  it('số tiền lớn không mất chính xác', () => {
    const r = computePeriod(
      input({
        members: [member('a'), member('b'), member('c')],
        items: [
          { id: 'nha', name: 'Nhà', kind: 'equal', amount: 9_007_199_254_740_990, enabled: true },
        ],
      }),
    )
    expect(r.payslips.reduce((s, p) => s + p.share, 0)).toBe(9_007_199_254_740_990)
  })
})

describe('computePeriod: kiểm tra đầu vào', () => {
  const base = () =>
    input({
      members: [member('a'), member('b')],
      items: [{ id: 'nha', name: 'Nhà', kind: 'equal', amount: 1000, enabled: true }],
    })

  function reasonOf(fn: () => unknown): string {
    try {
      fn()
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVALID')
      return (e as AppError).reason
    }
    throw new Error('không throw')
  }

  it('daysInMonth ngoài 28..31', () => {
    expect(reasonOf(() => computePeriod({ ...base(), daysInMonth: 27 }))).toBe('DAYS_IN_MONTH_INVALID')
    expect(reasonOf(() => computePeriod({ ...base(), daysInMonth: 32 }))).toBe('DAYS_IN_MONTH_INVALID')
    expect(reasonOf(() => computePeriod({ ...base(), daysInMonth: 30.5 }))).toBe('DAYS_IN_MONTH_INVALID')
  })

  it('month ngoài 1..12', () => {
    expect(reasonOf(() => computePeriod({ ...base(), month: 13 }))).toBe('PERIOD_INVALID')
  })

  it('days của thành viên không hợp lệ', () => {
    const mk = (days: number) => ({ ...base(), members: [member('a', { days }), member('b')] })
    expect(reasonOf(() => computePeriod(mk(31)))).toBe('DAYS_INVALID')
    expect(reasonOf(() => computePeriod(mk(-1)))).toBe('DAYS_INVALID')
    expect(reasonOf(() => computePeriod(mk(1.5)))).toBe('DAYS_INVALID')
  })

  it('thành viên trùng id', () => {
    expect(reasonOf(() => computePeriod({ ...base(), members: [member('a'), member('a')] }))).toBe(
      'DUPLICATE_MEMBER',
    )
  })

  it('số tiền không phải số nguyên không âm', () => {
    const item = (amount: number) => ({
      ...base(),
      items: [{ id: 'x', name: 'X', kind: 'equal' as const, amount, enabled: true }],
    })
    expect(reasonOf(() => computePeriod(item(-1)))).toBe('AMOUNT_INVALID')
    expect(reasonOf(() => computePeriod(item(10.5)))).toBe('AMOUNT_INVALID')
    expect(reasonOf(() => computePeriod(item(Number.NaN)))).toBe('AMOUNT_INVALID')
    expect(
      reasonOf(() => computePeriod({ ...base(), water: { mode: 'total', total: -5 } })),
    ).toBe('AMOUNT_INVALID')
    expect(
      reasonOf(() =>
        computePeriod({
          ...base(),
          expenses: [
            { id: 'e', description: 'x', amount: 1.5, paidByMemberId: 'a', spentOn: '2026-11-01' },
          ],
        }),
      ),
    ).toBe('AMOUNT_INVALID')
  })

  it('qty không hợp lệ', () => {
    const run = () =>
      computePeriod(
        input({
          members: [member('a', { qty: { xe: -1 } })],
          items: [{ id: 'xe', name: 'Xe', kind: 'per_unit', amount: 100, enabled: true }],
        }),
      )
    expect(reasonOf(run)).toBe('QTY_INVALID')
  })

  it('người trả không nằm trong danh sách thành viên', () => {
    expect(
      reasonOf(() =>
        computePeriod({
          ...base(),
          expenses: [
            { id: 'e', description: 'x', amount: 10, paidByMemberId: 'zzz', spentOn: '2026-11-01' },
          ],
        }),
      ),
    ).toBe('PAYER_NOT_FOUND')
  })

  it('spentOn sai định dạng', () => {
    expect(
      reasonOf(() =>
        computePeriod({
          ...base(),
          expenses: [
            { id: 'e', description: 'x', amount: 10, paidByMemberId: 'a', spentOn: '20/11' },
          ],
        }),
      ),
    ).toBe('SPENT_ON_INVALID')
  })
})

describe('computePeriod: bất biến Σ share === grandTotal', () => {
  // PRNG tất định (mulberry32) để test lặp lại được
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('500 input ngẫu nhiên hợp lệ', () => {
    const rand = rng(20261110)
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
    for (let n = 0; n < 500; n++) {
      const N = int(28, 31)
      const count = int(1, 7)
      const members = Array.from({ length: count }, (_, i) =>
        member(`m${i}`, {
          isOwner: i === 0,
          included: rand() > 0.2 || i === 0,
          days: rand() > 0.3 ? N : int(0, N),
          qty: { xe: int(0, 2) },
        }),
      )
      const util = () =>
        rand() > 0.2 ? ({ mode: 'total', total: int(0, 5_000_000) } as const) : null
      const r = computePeriod(
        input({
          daysInMonth: N,
          members,
          items: [
            { id: 'nha', name: 'Nhà', kind: 'equal', amount: int(0, 20_000_000), enabled: rand() > 0.2 },
            { id: 'xe', name: 'Xe', kind: 'per_unit', amount: int(0, 300_000), enabled: rand() > 0.2 },
          ],
          electricity: util(),
          water: util(),
          expenses: Array.from({ length: int(0, 4) }, (_, i) => ({
            id: `e${i}`,
            description: `Chi ${i}`,
            amount: int(0, 1_000_000),
            paidByMemberId: `m${int(0, count - 1)}`,
            spentOn: '2026-11-15',
          })),
        }),
      )
      const sum = r.payslips.reduce((s, p) => s + p.share, 0)
      expect(sum).toBe(r.grandTotal)
      for (const p of r.payslips) {
        expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBe(p.share)
      }
    }
  })
})
