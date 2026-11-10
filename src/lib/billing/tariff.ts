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
  const vat = Math.round((base * tariff.vatPct) / 100)
  const surcharges = tariff.surcharges.map((s) => ({
    name: s.name,
    amount: Math.round((base * s.pct) / 100),
  }))
  const total = base + vat + surcharges.reduce((sum, s) => sum + s.amount, 0)

  return { usage, lines, base, vat, surcharges, total }
}
