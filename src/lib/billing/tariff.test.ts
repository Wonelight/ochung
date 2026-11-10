import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { calcTieredAmount, usageFromReadings } from './tariff'
import type { Tariff } from './types'

const hanoiWater: Tariff = {
  tiers: [
    { upTo: 10, price: 8500 },
    { upTo: 20, price: 9900 },
    { upTo: 30, price: 16000 },
    { upTo: null, price: 27000 },
  ],
  perPerson: false,
  registeredPeople: 1,
  vatPct: 5,
  surcharges: [{ name: 'Phí BVMT', pct: 10 }],
}

const hcmWater: Tariff = {
  tiers: [
    { upTo: 4, price: 6700 },
    { upTo: 6, price: 12900 },
    { upTo: null, price: 14400 },
  ],
  perPerson: true,
  registeredPeople: 4,
  vatPct: 0,
  surcharges: [],
}

describe('calcTieredAmount', () => {
  it('tính bậc + VAT + phụ phí (Hà Nội, 18 m³)', () => {
    const r = calcTieredAmount(18, hanoiWater)
    expect(r.usage).toBe(18)
    expect(r.base).toBe(164_200)
    expect(r.vat).toBe(8_210)
    expect(r.surcharges).toEqual([{ name: 'Phí BVMT', amount: 16_420 }])
    expect(r.total).toBe(188_830)
    expect(r.lines.map((l) => l.units)).toEqual([10, 8])
    expect(r.lines).toEqual([
      { from: 0, to: 10, units: 10, price: 8500, amount: 85_000 },
      { from: 10, to: 18, units: 8, price: 9900, amount: 79_200 },
    ])
  })

  it('perPerson: mốc nhân số người đăng ký (TP.HCM, 4 người, 20 m³)', () => {
    const r = calcTieredAmount(20, hcmWater)
    expect(r.base).toBe(158_800) // 16×6700 + 4×12900
    expect(r.lines.map((l) => [l.from, l.to, l.units])).toEqual([
      [0, 16, 16],
      [16, 20, 4],
    ])
  })

  it('perPerson: vượt mốc cuối đi vào bậc không giới hạn', () => {
    const r = calcTieredAmount(30, hcmWater) // mốc 16, 24
    expect(r.lines.map((l) => l.units)).toEqual([16, 8, 6])
    expect(r.base).toBe(16 * 6700 + 8 * 12900 + 6 * 14400)
  })

  it('usage = 0 → mọi thứ bằng 0, không có dòng', () => {
    const r = calcTieredAmount(0, hanoiWater)
    expect(r.lines).toEqual([])
    expect(r.base).toBe(0)
    expect(r.vat).toBe(0)
    expect(r.total).toBe(0)
  })

  it('đúng mốc bậc: không sinh dòng 0 đơn vị', () => {
    const r = calcTieredAmount(20, hanoiWater)
    expect(r.lines.map((l) => l.units)).toEqual([10, 10])
  })

  it('đi hết các bậc kể cả bậc không giới hạn (45 m³)', () => {
    const r = calcTieredAmount(45, hanoiWater)
    expect(r.base).toBe(85_000 + 99_000 + 160_000 + 405_000)
    expect(r.lines[3]).toEqual({ from: 30, to: 45, units: 15, price: 27000, amount: 405_000 })
  })

  it('VAT và phụ phí làm tròn tới đồng', () => {
    const t: Tariff = {
      tiers: [{ upTo: null, price: 1001 }],
      perPerson: false,
      registeredPeople: 1,
      vatPct: 5,
      surcharges: [{ name: 'Phụ phí', pct: 10 }],
    }
    const r = calcTieredAmount(1, t) // base 1001 → vat 50.05→50, phụ phí 100.1→100
    expect(r.vat).toBe(50)
    expect(r.surcharges).toEqual([{ name: 'Phụ phí', amount: 100 }])
    expect(r.total).toBe(1001 + 50 + 100)
  })

  it('từ chối usage âm hoặc không nguyên', () => {
    expect(() => calcTieredAmount(-1, hanoiWater)).toThrow(AppError)
    expect(() => calcTieredAmount(1.5, hanoiWater)).toThrow(AppError)
  })
})

describe('calcTieredAmount: phần trăm 1 chữ số thập phân', () => {
  const only = (price: number, vatPct: number, pct = 0): Tariff => ({
    tiers: [{ upTo: null, price }],
    perPerson: false,
    registeredPeople: 1,
    vatPct,
    surcharges: [{ name: 'Phụ phí', pct }],
  })

  it('base 5500 × 0,7% = 38,5 → 39 (không bị float kéo xuống 38)', () => {
    const r = calcTieredAmount(5500, only(1, 0.7, 0.7))
    expect(r.base).toBe(5500)
    expect(r.vat).toBe(39)
    expect(r.surcharges[0].amount).toBe(39)
  })
  it('10500 × 0,7% → 74 và 2750 × 1,4% → 39', () => {
    expect(calcTieredAmount(10500, only(1, 0.7)).vat).toBe(74)
    expect(calcTieredAmount(2750, only(1, 1.4)).vat).toBe(39)
  })
  it('khớp tham chiếu BigInt (nửa lên) với base 1..3000 (bước 7) và mọi pct 0,0..100,0', () => {
    const mismatches: string[] = []
    for (let base = 1; base <= 3000; base += 7) {
      for (let tenths = 0; tenths <= 1000; tenths++) {
        const exact = Number((BigInt(2) * BigInt(base) * BigInt(tenths) + BigInt(1000)) / BigInt(2000))
        if (calcTieredAmount(base, only(1, tenths / 10)).vat !== exact) mismatches.push(`${base} × ${tenths / 10}%`)
      }
    }
    expect(mismatches).toEqual([])
  })
})

describe('usageFromReadings', () => {
  it('trả hiệu hai chỉ số', () => {
    expect(usageFromReadings(452, 464)).toBe(12)
    expect(usageFromReadings(10, 10)).toBe(0)
  })

  it('chỉ số mới nhỏ hơn chỉ số cũ → AppError READING_DECREASED', () => {
    expect(() => usageFromReadings(464, 452)).toThrow(/Chỉ số mới phải ≥ chỉ số cũ/)
    try {
      usageFromReadings(464, 452)
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVALID')
      expect((e as AppError).reason).toBe('READING_DECREASED')
    }
  })

  it('chỉ số âm hoặc không nguyên → AppError READING_INVALID', () => {
    for (const [p, c] of [[-1, 5], [0, -5], [1.5, 3], [0, 2.5], [NaN, 3]]) {
      try {
        usageFromReadings(p, c)
        expect.unreachable()
      } catch (e) {
        expect(e).toBeInstanceOf(AppError)
        expect((e as AppError).reason).toBe('READING_INVALID')
        expect((e as AppError).message).toBe('Chỉ số không hợp lệ')
      }
    }
  })
})
