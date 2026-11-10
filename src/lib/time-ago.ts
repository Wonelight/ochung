const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "vừa xong", "5 phút trước", "2 giờ trước", "hôm qua", "3 ngày trước" (tính theo khoảng thời gian trôi qua). */
export function timeAgoVi(then: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - then.getTime())
  if (diff < MINUTE) return 'vừa xong'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút trước`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} giờ trước`
  if (diff < 2 * DAY) return 'hôm qua'
  return `${Math.floor(diff / DAY)} ngày trước`
}
