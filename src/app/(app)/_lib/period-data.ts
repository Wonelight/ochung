import { db } from '@/db'
import { AppError } from '@/lib/errors'
import type { Actor } from '@/server/actor'
import { getPeriodView, type PeriodView } from '@/server/periods'

/**
 * Đọc một tháng cho trang xem. Tháng nháp đang nhập dở có thể chưa tính được (ví dụ chưa ai được tính tháng này):
 * lỗi nghiệp vụ được trả về thành câu tiếng Việt để trang hiện ra, không làm hỏng cả trang.
 */
export async function loadPeriodView(actor: Actor, periodId: string): Promise<{ view: PeriodView | null; error: string | null }> {
  try {
    return { view: await getPeriodView(db, actor, periodId), error: null }
  } catch (e) {
    if (e instanceof AppError) return { view: null, error: e.message }
    throw e
  }
}

/** `?period=<id>` của URL (tháng đang xem). */
export function periodParam(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined
}

/** Giá trị của `?period=`, nhưng vẫn nhận `?ky=` của link và thông báo đẩy đã gửi trước khi địa chỉ đổi sang tiếng Anh. */
export async function legacyPeriod(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const sp = await searchParams
  return sp.period ?? sp.ky
}
