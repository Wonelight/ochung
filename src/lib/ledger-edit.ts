/**
 * Link mở trang sửa một khoản chi từ bảng Chi tiêu tháng, theo đúng quyền server kiểm (`authorizeExpenseWrite`):
 * chủ nhà sửa mọi khoản (kể cả tháng đã chốt) ở tab Khoản chi lẻ của đúng tháng; thành viên chỉ khoản chính mình nhập,
 * mình là người trả, khi tháng còn nháp (trang Thêm khoản chi của thành viên liệt kê đúng các khoản đó).
 * `canWrite`: nhà chưa lưu trữ và người xem chưa rời nhà. null = không sửa được, hàng chỉ để đọc.
 */
export function expenseEditHref(o: {
  canWrite: boolean
  isOwner: boolean
  status: 'draft' | 'closed'
  periodId: string
  /** Id thành viên của người xem trong nhà. */
  meId: string | null
  expense: { id: string; mine: boolean; paidByMemberId: string }
}): string | null {
  if (!o.canWrite) return null
  const id = encodeURIComponent(o.expense.id)
  if (o.isOwner) return `/create?period=${encodeURIComponent(o.periodId)}&tab=expense&expense=${id}`
  if (o.expense.mine && o.expense.paidByMemberId === o.meId && o.status === 'draft') return `/create?expense=${id}`
  return null
}

/** `?expense=<id>` của trang Tạo: mở thẳng form sửa khoản chi đó. */
export function expenseParam(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null
}
