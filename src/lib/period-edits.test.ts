import { describe, expect, it } from 'vitest'
import { computePeriod } from './billing/compute'
import type { Tariff } from './billing/types'
import { diffEdits, editorStateOf, inputWithState, utilityInputOf, type EditorSnapshot } from './period-edits'

const TARIFF: Tariff = { tiers: [{ upTo: null, price: 3_500 }], perPerson: false, registeredPeople: 1, vatPct: 0, surcharges: [] }

// Ví dụ spec §5.4, Chi ở 15 ngày đã nhập, điện nước chưa nhập
const snapshot: EditorSnapshot = {
  year: 2026,
  month: 11,
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
  ],
  utilities: {
    electricity: { mode: 'total', prev: null, curr: null, total: null, tariff: null },
    water: { mode: 'total', prev: null, curr: null, total: null, tariff: null },
  },
  expenses: [
    { id: 'e1', description: 'Nước giặt', amount: 200_000, paidByMemberId: 'an', spentOn: '2026-11-05' },
    { id: 'e2', description: 'Giấy vệ sinh', amount: 120_000, paidByMemberId: 'linh', spentOn: '2026-11-12' },
  ],
}

describe('utilityInputOf', () => {
  it('chế độ tổng cần tổng tiền; theo bậc cần đủ chỉ số đầu, cuối và bảng giá', () => {
    expect(utilityInputOf({ mode: 'total', prev: null, curr: null, total: null, tariff: null })).toBeNull()
    expect(utilityInputOf({ mode: 'total', prev: 1, curr: 2, total: 0, tariff: null })).toEqual({ mode: 'total', total: 0 })
    expect(utilityInputOf({ mode: 'tiered', prev: 1238, curr: null, total: null, tariff: TARIFF })).toBeNull()
    expect(utilityInputOf({ mode: 'tiered', prev: 1238, curr: 1398, total: null, tariff: TARIFF })).toEqual({
      mode: 'tiered',
      prev: 1238,
      curr: 1398,
      tariff: TARIFF,
    })
  })
})

describe('diffEdits', () => {
  it('không đổi gì → null', () => {
    const s = editorStateOf(snapshot)
    expect(diffEdits(s, editorStateOf(snapshot))).toBeNull()
  })

  it('chỉ gửi các trường đã đổi', () => {
    const base = editorStateOf(snapshot)
    const next = structuredClone(base)
    next.utilities.electricity.total = 1_260_000
    next.members.chi.days = 14
    next.members.binh.included = false
    next.items.dv = false
    expect(diffEdits(base, next)).toEqual({
      utilities: { electricity: { total: 1_260_000 } },
      members: [
        { memberId: 'binh', included: false },
        { memberId: 'chi', days: 14 },
      ],
      items: [{ itemId: 'dv', enabled: false }],
    })
  })
})

describe('inputWithState', () => {
  it('ráp trạng thái đang sửa vào bản chụp → computePeriod ra đúng bảng §5.4', () => {
    const state = editorStateOf(snapshot)
    state.utilities.electricity.total = 1_260_000
    state.utilities.water.total = 315_000
    const result = computePeriod(inputWithState(snapshot, state))
    expect(result.grandTotal).toBe(10_855_000)
    const due = Object.fromEntries(result.payslips.map((p) => [p.memberId, p.due]))
    expect(due).toEqual({ linh: null, an: 2_600_000, binh: 2_680_000, chi: 2_575_000 })
  })

  it('tắt khoản và đổi số ngày được áp vào đầu vào', () => {
    const state = editorStateOf(snapshot)
    state.items.nha = false
    state.members.chi.days = 30
    const input = inputWithState(snapshot, state)
    expect(input.items.find((i) => i.id === 'nha')?.enabled).toBe(false)
    expect(input.members.find((m) => m.memberId === 'chi')?.days).toBe(30)
    expect(input.daysInMonth).toBe(30)
    expect(input.electricity).toBeNull()
  })
})
