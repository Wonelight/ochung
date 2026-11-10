/** upTo cộng dồn; null = không giới hạn (bậc cuối). */
export type Tier = { upTo: number | null; price: number }

export type Tariff = {
  tiers: Tier[]
  perPerson: boolean
  registeredPeople: number
  vatPct: number
  surcharges: { name: string; pct: number }[]
}

export type TierLine = { from: number; to: number; units: number; price: number; amount: number }

export type TariffResult = {
  usage: number
  lines: TierLine[]
  base: number
  vat: number
  surcharges: { name: string; amount: number }[]
  total: number
}
