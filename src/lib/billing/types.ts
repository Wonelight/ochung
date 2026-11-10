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

export type PeriodMember = {
  memberId: string
  name: string
  isOwner: boolean
  /** false = không tính tháng này: không có phiếu, không vào M và Σd. */
  included: boolean
  days: number
  /** itemId -> số lượng (khoản per_unit); thiếu = 0. */
  qty: Record<string, number>
}

export type FixedItem = {
  id: string
  name: string
  kind: 'equal' | 'per_unit'
  /** equal: tổng cả tháng; per_unit: đơn giá. */
  amount: number
  enabled: boolean
}

export type UtilityInput =
  | { mode: 'total'; total: number }
  | { mode: 'tiered'; prev: number; curr: number; tariff: Tariff }

export type ExpenseInput = {
  id: string
  description: string
  amount: number
  paidByMemberId: string
  /** Ngày chi, dạng YYYY-MM-DD. */
  spentOn: string
}

/** `members` đã sắp theo sortOrder; thứ tự này cũng là thứ tự ưu tiên khi chia dư đồng. */
export type PeriodInput = {
  year: number
  month: number
  daysInMonth: number
  members: PeriodMember[]
  items: FixedItem[]
  electricity: UtilityInput | null
  water: UtilityInput | null
  expenses: ExpenseInput[]
}

export type PayslipLine = {
  /** 'item:<itemId>' | 'electricity' | 'water' | 'expense:<expenseId>' */
  key: string
  group: 'fixed' | 'utility' | 'expense'
  label: string
  detail: string
  amount: number
}

export type Payslip = {
  memberId: string
  lines: PayslipLine[]
  share: number
  advanced: number
  /** share − advanced; null cho chủ nhà. Âm = chủ nhà phải trả lại. */
  due: number | null
}

export type UtilityResult = { total: number; tariff?: TariffResult; usage?: number }

export type PeriodResult = {
  electricity: UtilityResult | null
  water: UtilityResult | null
  grandTotal: number
  payslips: Payslip[]
}
