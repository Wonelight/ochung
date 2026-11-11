import { paymentStatus } from './billing/status'
import type { PaymentRecord, PaymentStatus, Payslip } from './billing/types'
import { formatVnd } from './money'
import { dueNote } from './vn-time'

export type BillFilter = 'all' | 'unpaid' | 'pending' | 'paid'
export type PillTone = 'paid' | 'pending' | 'unpaid'

/** Trạng thái thanh toán của từng phiếu phải chuyển (chủ nhà không có), từ bản ghi thanh toán của từng người. */
export function statusesFor(payslips: Payslip[], records: Record<string, PaymentRecord[]>): Record<string, PaymentStatus> {
  const out: Record<string, PaymentStatus> = {}
  for (const p of payslips) {
    if (p.due === null) continue
    out[p.memberId] = paymentStatus(p.due, records[p.memberId] ?? [])
  }
  return out
}

/** Bộ lọc của màn Hóa đơn: "Còn thiếu" và "Chủ nhà nợ" đều tính là Chưa trả. */
export function billFilterOf(kind: PaymentStatus['kind']): Exclude<BillFilter, 'all'> {
  if (kind === 'paid') return 'paid'
  if (kind === 'pending') return 'pending'
  return 'unpaid'
}

/** Tiến độ thu của chủ nhà: số đã nhận trên tổng phải thu (không tính phần của chủ nhà). */
export function collectionSummary(
  payslips: Payslip[],
  statuses: Record<string, PaymentStatus>,
): { collected: number; expected: number; paidCount: number; payerCount: number } {
  let collected = 0
  let expected = 0
  let paidCount = 0
  let payerCount = 0
  for (const p of payslips) {
    if (p.due === null) continue
    payerCount++
    expected += Math.max(p.due, 0)
    const s = statuses[p.memberId]
    if (!s) continue
    collected += s.confirmedIn
    if (s.kind === 'paid') paidCount++
  }
  return { collected, expected, paidCount, payerCount }
}

/** Màu và chữ của nhãn trạng thái (màu theo mockup: đã trả / chờ xác nhận / chưa trả). */
export function pillFor(status: PaymentStatus): { tone: PillTone; text: string } {
  switch (status.kind) {
    case 'paid':
      return { tone: 'paid', text: 'Đã trả' }
    case 'pending':
      return { tone: 'pending', text: 'Chờ xác nhận' }
    case 'partial':
      return { tone: 'unpaid', text: `Còn thiếu ${formatVnd(status.balance)} đ` }
    case 'owner_owes':
      return { tone: 'unpaid', text: `Chủ nhà nợ ${formatVnd(-status.balance)} đ` }
    default:
      return { tone: 'unpaid', text: 'Chưa trả' }
  }
}

export type PaymentRow = {
  memberId: string
  name: string
  /** Hạt giống ảnh đại diện (tên hiện tại + số lần "Tạo hình mới"); thiếu thì dùng `name`. */
  avatarSeed: string
  isOwner: boolean
  note: string
  /** Số tiền riêng của người đó: phần của chủ nhà; cần chuyển (hoặc được trả lại) của thành viên. */
  amount: number
  pill: { tone: PillTone; text: string } | null
  /** Nhóm lọc của màn Hóa đơn; null = chỉ hiện ở "Tất cả" (chủ nhà, tháng nháp). */
  filter: Exclude<BillFilter, 'all'> | null
}

/** Danh sách "Thanh toán tháng này" (Trang chủ) và các hàng của màn Hóa đơn, theo thứ tự thành viên. */
export function paymentRows(v: {
  status: 'draft' | 'closed'
  dueDate: string
  payslips: Payslip[]
  names: Map<string, string>
  /** Hạt giống ảnh đại diện theo id thành viên (`listAvatarSeeds`). */
  seeds?: Record<string, string>
  statuses: Record<string, PaymentStatus>
  now: Date
}): PaymentRow[] {
  return v.payslips.map((p) => {
    const name = v.names.get(p.memberId) ?? '—'
    const avatarSeed = v.seeds?.[p.memberId] ?? name
    if (p.due === null) return { memberId: p.memberId, name, avatarSeed, isOwner: true, note: 'Chủ nhà', amount: p.share, pill: null, filter: null }
    const amount = Math.abs(p.due)
    const s = v.status === 'closed' ? v.statuses[p.memberId] : undefined
    let note: string
    if (p.due < 0) note = 'Chủ nhà cần trả lại'
    else if (!s) note = p.advanced > 0 ? `Đã ứng ${formatVnd(p.advanced)} đ` : 'Chưa gửi hóa đơn'
    else if (s.kind === 'paid') note = 'Đã trả đủ'
    else if (s.kind === 'pending') note = 'Đã báo chuyển khoản'
    else note = dueNote(v.dueDate, v.now)
    return {
      memberId: p.memberId,
      name,
      avatarSeed,
      isOwner: false,
      note,
      amount,
      pill: s ? pillFor(s) : null,
      filter: s ? billFilterOf(s.kind) : null,
    }
  })
}
