import { describe, expect, it } from 'vitest'
import { computePeriod } from './billing/compute'
import type { PeriodInput } from './billing/types'
import { homeTiles } from './home-tiles'

const input: PeriodInput = {
  year: 2026,
  month: 11,
  daysInMonth: 30,
  members: [
    { memberId: 'linh', name: 'Linh', isOwner: true, included: true, days: 30, qty: { xe: 1 } },
    { memberId: 'an', name: 'An', isOwner: false, included: true, days: 30, qty: { xe: 1 } },
    { memberId: 'binh', name: 'Bình', isOwner: false, included: true, days: 30, qty: {} },
    { memberId: 'chi', name: 'Chi', isOwner: false, included: true, days: 15, qty: { xe: 1 } },
  ],
  items: [
    { id: 'nha', name: 'Tiền nhà', kind: 'equal', amount: 8_000_000, enabled: true },
    { id: 'dv', name: 'Phí dịch vụ', kind: 'equal', amount: 600_000, enabled: true },
    { id: 'xe', name: 'Tiền xe', kind: 'per_unit', amount: 120_000, enabled: true },
    { id: 'net', name: 'Internet', kind: 'equal', amount: 220_000, enabled: false },
  ],
  electricity: { mode: 'tiered', prev: 1238, curr: 1398, tariff: { tiers: [{ upTo: null, price: 7_875 }], perPerson: false, registeredPeople: 1, vatPct: 0, surcharges: [] } },
  water: { mode: 'total', total: 315_000 },
  expenses: [
    { id: 'e1', description: 'Nước giặt', amount: 200_000, paidByMemberId: 'an', spentOn: '2026-11-05' },
    { id: 'e2', description: 'Giấy', amount: 120_000, paidByMemberId: 'linh', spentOn: '2026-11-12' },
  ],
}

describe('homeTiles', () => {
  it('điện, nước trước; khoản tắt bị bỏ; khoản lớn nhất là hàng rộng cuối; số ô vuông lẻ thì ô cuối cũng rộng', () => {
    const tiles = homeTiles({ result: computePeriod(input), items: input.items, expenses: input.expenses })
    expect(tiles.map((t) => [t.key, t.amount, t.note, t.wide])).toEqual([
      ['electricity', 1_260_000, '160 kWh', false],
      ['water', 315_000, 'Theo hóa đơn', false],
      ['item:dv', 600_000, 'Cố định', false],
      ['item:xe', 360_000, 'Theo người', false],
      ['expenses', 320_000, '2 khoản', true],
      ['item:nha', 8_000_000, 'Cố định', true],
    ])
  })

  it('điện nước chưa nhập → "Chưa nhập", không có số tiền; không có chi lẻ thì không có ô chi lẻ', () => {
    const draft = { ...input, electricity: null, water: null, expenses: [] }
    const tiles = homeTiles({ result: computePeriod(draft), items: input.items, expenses: [] })
    expect(tiles.map((t) => [t.key, t.amount, t.note, t.wide])).toEqual([
      ['electricity', null, 'Chưa nhập', false],
      ['water', null, 'Chưa nhập', false],
      ['item:dv', 600_000, 'Cố định', false],
      ['item:xe', 360_000, 'Theo người', false],
      ['item:nha', 8_000_000, 'Cố định', true],
    ])
  })
})
