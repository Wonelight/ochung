import type { Db } from '@/db'

/** Gửi một thông báo đẩy; 'gone' = subscription đã hết hiệu lực (404/410), người gọi xóa nó. Task 14 cài thật. */
export type PushSender = (
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string },
) => Promise<'ok' | 'gone'>

export type PeriodEventDeps = { send?: PushSender }

// TODO(Task 14): hai hook chạy SAU khi transaction đã commit. Khi nối thông báo, bắt và ghi log mọi lỗi BÊN TRONG hook
// (gửi push hỏng, ghi thông báo lỗi...): lỗi sau commit không được nổi lên thành "lưu thất bại" vì số liệu đã được lưu.

/**
 * Gọi SAU khi transaction chốt sổ đã commit (không gọi bên trong transaction).
 * Task 14 nối vào thông báo trong app và web push; ở Task 11 chưa làm gì.
 */
export async function onPeriodClosed(db: Db, periodId: string, deps?: PeriodEventDeps): Promise<void> {
  void db
  void periodId
  void deps
}

/** Gọi đúng một lần cho mỗi thao tác sửa tháng đã chốt, SAU khi commit. Task 14 nối vào thông báo. */
export async function onPeriodUpdated(db: Db, periodId: string, deps?: PeriodEventDeps): Promise<void> {
  void db
  void periodId
  void deps
}
