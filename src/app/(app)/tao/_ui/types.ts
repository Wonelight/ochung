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
  meId: string
  /** Hôm nay ở Việt Nam, YYYY-MM-DD. */
  today: string
  /** Tháng sau của tháng đang sửa đã chốt: sửa chỉ số mới không tự sửa chỉ số cũ của tháng đó. */
  nextClosed: boolean
}
