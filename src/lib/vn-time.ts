// Ngày giờ theo Asia/Ho_Chi_Minh (UTC+7 quanh năm, không có giờ mùa hè), không phụ thuộc múi giờ của máy chạy.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const pad = (n: number) => String(n).padStart(2, '0')

function vn(now: Date): Date {
  return new Date(now.getTime() + VN_OFFSET_MS)
}

/** Ngày hôm nay ở Việt Nam, dạng YYYY-MM-DD (giá trị mặc định cho ô ngày chi). */
export function todayVn(now: Date): string {
  const d = vn(now)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Thời điểm → "dd/mm" theo giờ Việt Nam. */
export function dateVn(at: Date): string {
  const d = vn(at)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`
}

/** "2026-12-10" → "10/12". */
export function dayMonth(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`
}

/** Lời chào đầu trang chủ theo giờ Việt Nam. */
export function greetingVi(now: Date): string {
  const h = vn(now).getUTCHours()
  if (h >= 4 && h < 11) return 'Chào buổi sáng'
  if (h >= 11 && h < 13) return 'Chào buổi trưa'
  if (h >= 13 && h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function dayIndex(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS)
}

/** Ghi chú hạn đóng: "Hạn 10/12 · còn 1 ngày", "Hạn hôm nay 10/12", "Quá hạn 2 ngày · hạn 10/12". */
export function dueNote(dueDate: string, now: Date): string {
  const left = dayIndex(dueDate) - dayIndex(todayVn(now))
  const dm = dayMonth(dueDate)
  if (left > 0) return `Hạn ${dm} · còn ${left} ngày`
  if (left === 0) return `Hạn hôm nay ${dm}`
  return `Quá hạn ${-left} ngày · hạn ${dm}`
}
