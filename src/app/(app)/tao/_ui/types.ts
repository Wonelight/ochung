import type { ExpenseInput } from '@/lib/billing/types'
import type { EditorSnapshot } from '@/lib/period-edits'
import type { Preview } from './use-period-editor'

/** Dữ liệu trang Tạo truyền xuống các phần client (chỉ kiểu dữ liệu tuần tự hóa được). */
export type CreateData = {
  houseId: string
  period: { id: string; year: number; month: number; status: 'draft' | 'closed'; daysInMonth: number }
  snapshot: EditorSnapshot
  /** Tháng nháp: kết quả `previewPeriod` lúc mở trang. Tháng đã chốt tính trên máy nên không dùng. */
  initialPreview: Preview
  /** Thành viên của tháng đã rời nhà. */
  leftIds: string[]
  /** Thành viên đang ở (chọn "Ai đã trả" khi thêm khoản chi lẻ). */
  payers: { id: string; name: string }[]
  /** Hạt giống ảnh đại diện theo id thành viên (kể cả người đã rời). */
  seeds: Record<string, string>
  meId: string
  /** Hôm nay ở Việt Nam, YYYY-MM-DD. */
  today: string
  /** Tháng sau của tháng đang sửa đã chốt: sửa chỉ số mới không tự sửa chỉ số cũ của tháng đó. */
  nextClosed: boolean
}

/**
 * Dữ liệu của tab Khoản chi lẻ. Chủ nhà dựng từ tháng đang làm hóa đơn (`expenseDataOf`); thành viên dựng từ các khoản chính mình
 * đã thêm ở tháng còn nháp (họ không xem được tháng nháp) và chỉ ghi được khoản do chính mình trả (`selfOnly`).
 */
export type ExpenseTabData = {
  houseId: string
  today: string
  meId: string
  /** Người đang ở nhà, chọn "Ai đã trả" khi thêm. */
  payers: { id: string; name: string }[]
  /** Người có thể là người trả của khoản đang sửa (kể cả người đã rời nhà trong tháng đó). */
  editPayers: { id: string; name: string }[]
  seeds: Record<string, string>
  expenses: ExpenseInput[]
  listTitle: string
  /** Tháng của khoản chi, dùng trong câu xác nhận xóa; null khi danh sách gồm nhiều tháng. */
  month: number | null
  /** Tháng đang sửa đã chốt: xóa khoản chi tính lại phiếu cả nhà. */
  closedMonth: boolean
  /** Người có thể được chọn làm người chia khi thêm / khi sửa một khoản (thành viên: cả nhà, dù chỉ ghi được khoản chính mình trả). */
  participantChoices: { id: string; name: string }[]
  participantEditChoices: { id: string; name: string }[]
  /** Người trong tháng đang bị tắt "Tính tháng này" (chủ nhà): khoản chi chọn riêng họ được cảnh báo vì họ không được chia. */
  uncountedIds: string[]
  /** Thành viên: không có ô "Ai đã trả" (luôn là chính mình) và câu báo kết quả nói rõ chủ nhà sẽ tính vào hóa đơn. */
  selfOnly: boolean
}

/** `uncountedIds`: người đang bị tắt "Tính tháng này" theo trạng thái đang sửa (đổi ngay khi chủ nhà bật/tắt, không đợi tải lại trang). */
export function expenseDataOf(data: CreateData, uncountedIds: string[]): ExpenseTabData {
  return {
    houseId: data.houseId,
    today: data.today,
    meId: data.meId,
    payers: data.payers,
    editPayers: data.snapshot.members.map((m) => ({ id: m.memberId, name: m.name })),
    participantChoices: data.payers,
    participantEditChoices: data.snapshot.members.map((m) => ({ id: m.memberId, name: m.name })),
    seeds: data.seeds,
    expenses: data.snapshot.expenses,
    listTitle: `Khoản chi tháng ${data.period.month}`,
    month: data.period.month,
    closedMonth: data.period.status === 'closed',
    uncountedIds,
    selfOnly: false,
  }
}
