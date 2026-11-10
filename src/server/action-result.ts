import { AppError } from '@/lib/errors'

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; message: string }

/** Bọc một thao tác server: lỗi nghiệp vụ trả câu tiếng Việt cho UI, lỗi lạ được ghi log và trả câu chung. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof AppError) return { ok: false, message: e.message }
    console.error(e)
    return { ok: false, message: 'Có lỗi xảy ra, vui lòng thử lại sau' }
  }
}
