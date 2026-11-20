import type { PaymentStatus, Payslip, PayslipLine, YM } from './billing/types'

export const LINE_GROUPS: { group: PayslipLine['group']; title: string }[] = [
  { group: 'fixed', title: 'Khoản cố định' },
  { group: 'utility', title: 'Điện nước theo ngày ở' },
  { group: 'expense', title: 'Chi lẻ' },
]

// Câu điện nước của các tháng đã chốt (kết quả lưu sẵn trong DB): "X ÷ N ngày-người × d" hoặc "X ÷ N ngày ở × d".
const LEGACY_UTILITY = /^(.+) ÷ (\d+) (?:ngày-người|ngày ở) × (\d+)$/

/** Dòng 0 đ là nhiễu nên bị ẩn; riêng điện, nước luôn hiện (để thấy cả trường hợp 0 ngày ở). */
export function visibleLines(lines: PayslipLine[]): PayslipLine[] {
  return lines.filter((l) => l.amount !== 0 || l.group === 'utility')
}

/** Các nhóm của phiếu theo thứ tự cố định, chỉ nhóm còn dòng sau khi lọc. */
export function groupLines(lines: PayslipLine[]): { group: PayslipLine['group']; title: string; lines: PayslipLine[] }[] {
  const shown = visibleLines(lines)
  return LINE_GROUPS.map((g) => ({ ...g, lines: shown.filter((l) => l.group === g.group) })).filter((g) => g.lines.length > 0)
}

/**
 * Chi tiết hiển thị của một dòng. Khoản chi lẻ có ngày chi thuộc tháng khác (tháng đó đã chốt nên được chuyển sang)
 * được ghi rõ "tính vào T12" như spec §6.
 */
export function lineDetail(line: PayslipLine, ym: YM, spentOnById: Map<string, string>): string {
  if (line.group === 'utility') {
    // viết lại lúc hiển thị, không sửa kết quả đã chốt: nói rõ số ngày của người này trên tổng ngày của cả nhà
    const m = LEGACY_UTILITY.exec(line.detail)
    return m ? `Ở ${m[3]}/${m[2]} ngày của cả nhà · tổng ${m[1]}` : line.detail
  }
  if (line.group !== 'expense') return line.detail
  const spentOn = spentOnById.get(line.key.slice('expense:'.length))
  if (!spentOn) return line.detail
  const sameMonth = Number(spentOn.slice(0, 4)) === ym.year && Number(spentOn.slice(5, 7)) === ym.month
  return sameMonth ? line.detail : `${line.detail}, tính vào T${ym.month}`
}

export type AdvancedItem = { key: string; label: string; amount: number }

/** Các khoản chi lẻ `memberId` đã trả trong tháng (là "tiền đã ứng" của phiếu), theo thứ tự đầu vào. */
export function advancedItems(
  memberId: string,
  expenses: { id: string; description: string; amount: number; paidByMemberId: string; spentOn: string }[],
): AdvancedItem[] {
  return expenses
    .filter((e) => e.paidByMemberId === memberId)
    .map((e) => ({ key: e.id, label: `${e.description} · ${Number(e.spentOn.slice(8, 10))}/${Number(e.spentOn.slice(5, 7))}`, amount: e.amount }))
}

export type Settlement = {
  rows: { label: string; amount: number; items?: AdvancedItem[] }[]
  /** amount null: đã thanh toán xong, không có số. muted: số không tô màu nhấn (tháng nháp, đã xong). */
  final: { label: string; amount: number | null; muted: boolean }
}

/**
 * Khối cuối phiếu. `self`: người xem đang xem phiếu của chính mình; không thì chủ nhà đang xem phiếu của `name`.
 * Phiếu chủ nhà (due null) chỉ có "Phần của bạn". Tháng đã chốt (có `status`): số chính là số CÒN LẠI theo các khoản đã
 * trả, giống Trang chủ và mã QR, kèm dòng "Đã chuyển" / "Chủ nhà đã trả lại". Tháng nháp: số dự kiến, không tô màu.
 */
export function settlement(
  slip: Payslip,
  who: { self: boolean; name: string; ownerName: string },
  opts: { status?: PaymentStatus; draft: boolean; advanced?: AdvancedItem[] },
): Settlement {
  const { self, name, ownerName } = who
  if (slip.due === null) {
    return { rows: [], final: { label: self ? 'Phần của bạn' : `Phần của ${name}`, amount: slip.share, muted: false } }
  }
  const rows: Settlement['rows'] = [{ label: self ? 'Tổng phần của bạn' : `Tổng phần của ${name}`, amount: slip.share }]
  if (slip.advanced > 0) {
    rows.push(opts.advanced ? { label: 'Trừ tiền đã ứng', amount: -slip.advanced, items: opts.advanced } : { label: 'Trừ tiền đã ứng', amount: -slip.advanced })
  }
  const s = opts.status
  if (s && s.confirmedIn > 0) rows.push({ label: 'Đã chuyển', amount: -s.confirmedIn })
  if (s && s.confirmedOut > 0) rows.push({ label: 'Chủ nhà đã trả lại', amount: s.confirmedOut })

  if (!s && opts.draft) {
    const final =
      slip.due < 0
        ? { label: self ? 'Chủ nhà dự kiến trả lại bạn' : `Bạn dự kiến trả lại ${name}`, amount: -slip.due, muted: true }
        : { label: self ? `Dự kiến cần chuyển cho ${ownerName}` : `${name} dự kiến cần chuyển cho bạn`, amount: slip.due, muted: true }
    return { rows, final }
  }
  const balance = s ? s.balance : slip.due
  const paidSome = (s?.confirmedIn ?? 0) > 0
  if (balance > 0) {
    const label = paidSome ? (self ? 'Bạn còn thiếu' : `${name} còn thiếu`) : self ? `Cần chuyển cho ${ownerName}` : `${name} cần chuyển cho bạn`
    return { rows, final: { label, amount: balance, muted: false } }
  }
  if (balance < 0) {
    return { rows, final: { label: self ? 'Chủ nhà cần trả lại bạn' : `Bạn cần trả lại ${name}`, amount: -balance, muted: false } }
  }
  if (!s) {
    // phòng hờ: tháng đã chốt nhưng không có trạng thái, phiếu 0 đ
    return { rows, final: { label: self ? `Cần chuyển cho ${ownerName}` : `${name} cần chuyển cho bạn`, amount: 0, muted: false } }
  }
  // còn 0: nói theo chiều tiền đã đi (như memberBalance ở Trang chủ), không phải lúc nào cũng là người đó đã trả
  const net = s.confirmedIn - s.confirmedOut
  const label =
    net > 0
      ? self ? 'Bạn đã thanh toán đủ' : `${name} đã thanh toán đủ`
      : net < 0
        ? self ? 'Chủ nhà đã trả lại bạn đủ' : `Bạn đã trả lại ${name} đủ`
        : self ? 'Bạn không cần chuyển khoản nào' : `${name} không cần chuyển khoản nào`
  return { rows, final: { label, amount: null, muted: true } }
}

/**
 * Lối sang màn Hóa đơn (xác nhận, ghi tiền mặt, đã trả lại) khi chủ nhà xem phiếu chưa xong của người khác. Không có khi
 * nhà đã lưu trữ (Hóa đơn không cho thao tác) hoặc tháng thuộc nhà khác nhà đang chọn (Hóa đơn mở theo nhà đang chọn).
 */
export function billsLinkFor(o: {
  isOwner: boolean
  self: boolean
  closed: boolean
  archived: boolean
  inCurrentHouse: boolean
  periodId: string
  status: PaymentStatus | undefined
}): { href: string; label: string } | null {
  if (!o.isOwner || o.self || !o.closed || o.archived || !o.inCurrentHouse || !o.status || o.status.kind === 'paid') return null
  return { href: `/bills?period=${o.periodId}`, label: o.status.kind === 'pending' ? 'Xác nhận ở Hóa đơn' : 'Ghi thanh toán ở Hóa đơn' }
}
