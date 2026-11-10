import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { periods } from '@/db/schema'
import type { PaymentRecord, PaymentStatus } from '@/lib/billing/types'
import { statusesFor } from '@/lib/payments-view'

/**
 * Bản ghi thanh toán của từng thành viên trong tháng. Chưa có bảng thanh toán nên mọi người chưa trả gì.
 * TODO(Task 13): đọc bản ghi thật (bảng payments); các màn chỉ đọc trạng thái qua `getStatuses` nên không phải sửa.
 */
async function paymentRecords(db: Db, periodId: string): Promise<Record<string, PaymentRecord[]>> {
  void db
  void periodId
  return {}
}

/**
 * Trạng thái thanh toán của từng người trong một tháng ĐÃ CHỐT (memberId → trạng thái; chủ nhà không có).
 * Tháng nháp → {} (chưa gửi nên chưa có gì để trả). Người gọi đã kiểm quyền xem tháng (getPeriodView).
 */
export async function getStatuses(db: Db, periodId: string): Promise<Record<string, PaymentStatus>> {
  const [row] = await db.select({ status: periods.status, result: periods.result }).from(periods).where(eq(periods.id, periodId)).limit(1)
  if (!row || row.status !== 'closed' || !row.result) return {}
  return statusesFor(row.result.payslips, await paymentRecords(db, periodId))
}
