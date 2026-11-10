import { AppError } from '@/lib/errors'
import type { Tariff, TariffResult, TierLine } from './types'

function assertReading(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new AppError('INVALID', 'READING_INVALID', 'Chỉ số không hợp lệ')
  }
}

/** Lượng dùng = chỉ số mới − chỉ số cũ; chỉ số phải là số nguyên không âm và không giảm. */
export function usageFromReadings(prev: number, curr: number): number {
  assertReading(prev)
  assertReading(curr)
  if (curr < prev) {
    throw new AppError('INVALID', 'READING_DECREASED', 'Chỉ số mới phải ≥ chỉ số cũ')
  }
  return curr - prev
}

/**
 * base × pct / 100 làm tròn nửa lên, tính bằng số nguyên: pct có tối đa 1 chữ số thập phân nên đổi ra phần mười
 * (t = pct × 10) rồi round(base × t / 1000) = floor((2 × base × t + 1000) / 2000). Không dùng float để 0,7% × 5.500 = 38,5 không bị lệch xuống 38.
 */
function percentOf(base: number, pct: number): number {
  const tenths = Math.round(pct * 10)
  return Math.floor((2 * base * tenths + 1000) / 2000)
}

/**
 * Tính tiền theo bậc. Mốc `upTo` cộng dồn; khi `perPerson` mỗi mốc nhân `registeredPeople`.
 * Chỉ trả các bậc có dùng (units > 0). VAT và từng phụ phí = round(base × pct / 100),
 * cùng tính trên `base` (phụ phí không chịu VAT và không chồng lên nhau).
 */
export function calcTieredAmount(usage: number, tariff: Tariff): TariffResult {
  if (!Number.isSafeInteger(usage) || usage < 0) {
    throw new AppError('INVALID', 'USAGE_INVALID', 'Lượng tiêu thụ không hợp lệ')
  }

  const factor = tariff.perPerson ? tariff.registeredPeople : 1
  const lines: TierLine[] = []
  let from = 0
  for (const tier of tariff.tiers) {
    if (from >= usage) break
    const limit = tier.upTo === null ? usage : tier.upTo * factor
    const to = Math.min(limit, usage)
    const units = to - from
    if (units > 0) {
      lines.push({ from, to, units, price: tier.price, amount: units * tier.price })
      from = to
    }
  }

  const base = lines.reduce((sum, l) => sum + l.amount, 0)
  const vat = percentOf(base, tariff.vatPct)
  const surcharges = tariff.surcharges.map((s) => ({
    name: s.name,
    amount: percentOf(base, s.pct),
  }))
  const total = base + vat + surcharges.reduce((sum, s) => sum + s.amount, 0)

  return { usage, lines, base, vat, surcharges, total }
}
