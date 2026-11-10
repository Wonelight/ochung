import type { Payslip, PayslipLine, YM } from './billing/types'

export const LINE_GROUPS: { group: PayslipLine['group']; title: string }[] = [
  { group: 'fixed', title: 'Khoản cố định' },
  { group: 'utility', title: 'Điện nước theo ngày ở' },
  { group: 'expense', title: 'Chi phát sinh' },
]

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
  if (line.group !== 'expense') return line.detail
  const spentOn = spentOnById.get(line.key.slice('expense:'.length))
  if (!spentOn) return line.detail
  const sameMonth = Number(spentOn.slice(0, 4)) === ym.year && Number(spentOn.slice(5, 7)) === ym.month
  return sameMonth ? line.detail : `${line.detail}, tính vào T${ym.month}`
}

export type Settlement = {
  rows: { label: string; amount: number }[]
  final: { label: string; amount: number; refund: boolean }
}

/**
 * Khối cuối phiếu. `self`: người xem đang xem phiếu của chính mình; không thì chủ nhà đang xem phiếu của `name`.
 * Phiếu chủ nhà (due null) chỉ có "Phần của bạn". due < 0: chủ nhà phải trả lại.
 */
export function settlement(slip: Payslip, who: { self: boolean; name: string; ownerName: string }): Settlement {
  if (slip.due === null) {
    return { rows: [], final: { label: who.self ? 'Phần của bạn' : `Phần của ${who.name}`, amount: slip.share, refund: false } }
  }
  const rows = [
    { label: who.self ? 'Tổng phần của bạn' : `Tổng phần của ${who.name}`, amount: slip.share },
    { label: 'Trừ tiền đã ứng', amount: -slip.advanced },
  ]
  if (slip.due < 0) {
    return {
      rows,
      final: { label: who.self ? 'Chủ nhà cần trả lại bạn' : `Bạn cần trả lại ${who.name}`, amount: -slip.due, refund: true },
    }
  }
  return {
    rows,
    final: { label: who.self ? `Cần chuyển cho ${who.ownerName}` : `${who.name} cần chuyển cho bạn`, amount: slip.due, refund: false },
  }
}
