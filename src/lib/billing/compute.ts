import { AppError } from '@/lib/errors'
import { formatVnd } from '@/lib/money'
import { allocate } from './allocate'
import { calcTieredAmount, usageFromReadings } from './tariff'
import type {
  PayslipLine,
  Payslip,
  PeriodInput,
  PeriodMember,
  PeriodResult,
  UtilityInput,
  UtilityResult,
} from './types'

function invalid(reason: string, message: string): never {
  throw new AppError('INVALID', reason, message)
}

function assertMoney(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    invalid('AMOUNT_INVALID', `${what} phải là số tiền nguyên không âm`)
  }
}

/** Ngày dương lịch thật dạng YYYY-MM-DD (kiểm cả năm nhuận). */
function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const last = mo === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31
  return d <= last
}

function validate(input: PeriodInput): void {
  if (!Number.isInteger(input.year) || !Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    invalid('PERIOD_INVALID', 'Tháng tính tiền không hợp lệ')
  }
  const N = input.daysInMonth
  if (!Number.isInteger(N) || N < 28 || N > 31) {
    invalid('DAYS_IN_MONTH_INVALID', 'Số ngày của tháng phải từ 28 đến 31')
  }

  const seen = new Set<string>()
  if (input.members.filter((m) => m.isOwner).length > 1) {
    invalid('MULTIPLE_OWNERS', 'Chỉ được có một chủ nhà trong danh sách thành viên')
  }
  for (const m of input.members) {
    if (seen.has(m.memberId)) invalid('DUPLICATE_MEMBER', 'Thành viên bị trùng trong danh sách')
    seen.add(m.memberId)
    // Người không được tính tháng này không ảnh hưởng phép tính, nên không kiểm số ngày của họ.
    if (m.included && (!Number.isInteger(m.days) || m.days < 0 || m.days > N)) {
      invalid('DAYS_INVALID', `Số ngày ở của ${m.name} phải là số nguyên từ 0 đến ${N}`)
    }
  }

  const itemIds = new Set<string>()
  for (const item of input.items) {
    if (itemIds.has(item.id)) invalid('DUPLICATE_ITEM', `Khoản cố định "${item.name}" bị trùng mã`)
    itemIds.add(item.id)
    if (!item.enabled) continue
    assertMoney(item.amount, `Số tiền của khoản "${item.name}"`)
    if (item.kind === 'per_unit') {
      for (const m of input.members) {
        if (!m.included) continue
        const q = m.qty[item.id] ?? 0
        if (!Number.isSafeInteger(q) || q < 0) {
          invalid('QTY_INVALID', `Số lượng "${item.name}" của ${m.name} phải là số nguyên không âm`)
        }
        assertMoney(q * item.amount, `Số tiền của khoản "${item.name}"`)
      }
    }
  }

  const expenseIds = new Set<string>()
  for (const e of input.expenses) {
    if (expenseIds.has(e.id)) invalid('DUPLICATE_EXPENSE', `Khoản chi "${e.description}" bị trùng mã`)
    expenseIds.add(e.id)
    assertMoney(e.amount, `Số tiền của khoản chi "${e.description}"`)
    if (!seen.has(e.paidByMemberId)) {
      invalid('PAYER_NOT_FOUND', `Người trả khoản chi "${e.description}" không có trong danh sách thành viên`)
    }
    if (!isRealDate(e.spentOn)) {
      invalid('SPENT_ON_INVALID', `Ngày chi của khoản "${e.description}" không hợp lệ`)
    }
  }
}

function utilityResult(u: UtilityInput | null, what: string): UtilityResult | null {
  if (u === null) return null
  if (u.mode === 'total') {
    assertMoney(u.total, `Tổng tiền ${what}`)
    return { total: u.total }
  }
  const usage = usageFromReadings(u.prev, u.curr)
  const tariff = calcTieredAmount(usage, u.tariff)
  assertMoney(tariff.total, `Tổng tiền ${what}`)
  return { total: tariff.total, tariff, usage }
}

/** "2026-11-20" -> "20/11" */
function dayMonth(spentOn: string): string {
  return `${Number(spentOn.slice(8, 10))}/${Number(spentOn.slice(5, 7))}`
}

/**
 * Tính phiếu cả tháng. Thứ tự `members` là thứ tự ưu tiên nhận đồng dư ở mọi phép chia.
 * Chỉ thành viên `included` có phần chia (M, Σd); người không được tính nhưng đã ứng tiền
 * có phiếu share 0 để thấy khoản phải hoàn lại. Không làm tròn: mỗi khoản được chia bằng `allocate`
 * nên Σ phần = tổng chi; bất biến này được kiểm lại ở cuối.
 */
export function computePeriod(input: PeriodInput): PeriodResult {
  validate(input)

  const electricity = utilityResult(input.electricity, 'điện')
  const water = utilityResult(input.water, 'nước')

  const active: PeriodMember[] = input.members.filter((m) => m.included)
  const M = active.length
  const ones = active.map(() => 1)
  const lines: PayslipLine[][] = active.map(() => [])

  // grandTotal tính độc lập với phép chia, để làm vế đối chứng cho Σ share.
  const items = input.items.filter((i) => i.enabled)
  const equalTotal = items.filter((i) => i.kind === 'equal').reduce((s, i) => s + i.amount, 0)
  const perUnitTotal = items
    .filter((i) => i.kind === 'per_unit')
    .reduce((s, i) => s + active.reduce((q, m) => q + (m.qty[i.id] ?? 0), 0) * i.amount, 0)
  const grandTotal =
    equalTotal +
    perUnitTotal +
    (electricity?.total ?? 0) +
    (water?.total ?? 0) +
    input.expenses.reduce((s, e) => s + e.amount, 0)
  if (!Number.isSafeInteger(grandTotal)) {
    invalid('TOTAL_TOO_LARGE', 'Tổng tiền của tháng vượt quá giới hạn tính toán')
  }

  if (M === 0) {
    if (grandTotal > 0) {
      invalid('NO_MEMBERS', 'Không có thành viên nào được tính trong tháng')
    }
    return { electricity, water, grandTotal: 0, payslips: [] }
  }

  // 1. Khoản cố định
  for (const item of items) {
    if (item.kind === 'equal') {
      const parts = allocate(item.amount, ones)
      const detail = `${formatVnd(item.amount)} ÷ ${M}`
      active.forEach((_, i) =>
        lines[i].push({
          key: `item:${item.id}`,
          group: 'fixed',
          label: item.name,
          detail,
          amount: parts[i],
        }),
      )
    } else {
      active.forEach((m, i) => {
        const qty = m.qty[item.id] ?? 0
        if (qty === 0) return
        lines[i].push({
          key: `item:${item.id}`,
          group: 'fixed',
          label: item.name,
          detail: `${qty} × ${formatVnd(item.amount)}`,
          amount: qty * item.amount,
        })
      })
    }
  }

  // 2. Điện, nước: chia theo số ngày ở; Σ ngày = 0 thì chia đều
  const sumDays = active.reduce((s, m) => s + m.days, 0)
  const addUtility = (key: 'electricity' | 'water', label: string, result: UtilityResult | null) => {
    if (result === null) return
    if (sumDays > 0) {
      const parts = allocate(result.total, active.map((m) => m.days))
      active.forEach((m, i) =>
        lines[i].push({
          key,
          group: 'utility',
          label,
          detail: `${formatVnd(result.total)} ÷ ${sumDays} ngày-người × ${m.days}`,
          amount: parts[i],
        }),
      )
    } else {
      const parts = allocate(result.total, ones)
      const detail = `${formatVnd(result.total)} ÷ ${M}`
      active.forEach((_, i) =>
        lines[i].push({ key, group: 'utility', label, detail, amount: parts[i] }),
      )
    }
  }
  addUtility('electricity', 'Điện', electricity)
  addUtility('water', 'Nước', water)

  // 3. Khoản phát sinh: mỗi khoản chia đều và là một dòng riêng
  const nameOf = new Map(input.members.map((m) => [m.memberId, m.name]))
  const advancedBy = new Map<string, number>()
  for (const e of input.expenses) {
    const parts = allocate(e.amount, ones)
    const detail = `${nameOf.get(e.paidByMemberId)} trả ${formatVnd(e.amount)} · ${dayMonth(e.spentOn)}`
    active.forEach((_, i) =>
      lines[i].push({
        key: `expense:${e.id}`,
        group: 'expense',
        label: e.description,
        detail,
        amount: parts[i],
      }),
    )
    advancedBy.set(e.paidByMemberId, (advancedBy.get(e.paidByMemberId) ?? 0) + e.amount)
  }

  // Người không được tính nhưng đã ứng tiền vẫn có phiếu (share 0, không dòng nào)
  // để khoản hoàn lại cho họ không biến mất khỏi sổ.
  const payslips: Payslip[] = []
  let k = 0
  for (const m of input.members) {
    const advanced = advancedBy.get(m.memberId) ?? 0
    if (!m.included && advanced === 0) continue
    const own = m.included ? lines[k++] : []
    const share = own.reduce((s, l) => s + l.amount, 0)
    payslips.push({
      memberId: m.memberId,
      lines: own,
      share,
      advanced,
      due: m.isOwner ? null : share - advanced,
    })
  }

  const sumShares = payslips.reduce((s, p) => s + p.share, 0)
  if (sumShares !== grandTotal) {
    throw new Error(`Lỗi tính tiền: tổng các phiếu ${sumShares} khác tổng chi ${grandTotal}`)
  }

  return { electricity, water, grandTotal, payslips }
}
