import { NextResponse } from 'next/server'
import { db } from '@/db'
import { AppError, type AppErrorCode } from '@/lib/errors'
import { getActor } from '@/server/actor'
import { removePushSubscription, savePushSubscription } from '@/server/notifications'
import { getVapidPublicKey } from '@/server/push'

// Đăng ký / hủy đăng ký web push của thiết bị này. Route handler không được layout bảo vệ và proxy chỉ kiểm "có cookie",
// nên mỗi hàm tự xác thực bằng getActor().

export const runtime = 'nodejs'

const STATUS: Record<AppErrorCode, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, CONFLICT: 409 }
const fail = (status: number, message: string) => NextResponse.json({ message }, { status })

function failure(e: unknown) {
  if (e instanceof AppError) return fail(e.reason === 'NO_SESSION' ? 401 : STATUS[e.code], e.message)
  console.error(e)
  return fail(500, 'Có lỗi xảy ra, vui lòng thử lại sau')
}

/** Chỉ nhận JSON: trình duyệt không gửi được `application/json` chéo trang nếu không qua CORS preflight. */
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AppError('INVALID', 'PUSH_SUBSCRIPTION', 'Yêu cầu không hợp lệ')
  }
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null) throw new AppError('INVALID', 'PUSH_SUBSCRIPTION', 'Yêu cầu không hợp lệ')
  return body as Record<string, unknown>
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** Khóa công khai VAPID cho `pushManager.subscribe` (null nếu máy chủ chưa cấu hình push). */
export async function GET() {
  try {
    await getActor()
    return NextResponse.json({ publicKey: getVapidPublicKey() })
  } catch (e) {
    return failure(e)
  }
}

/** Body: `PushSubscription.toJSON()` = { endpoint, keys: { p256dh, auth } }. */
export async function POST(request: Request) {
  try {
    const actor = await getActor()
    const body = await readJson(request)
    const keys = typeof body.keys === 'object' && body.keys !== null ? (body.keys as Record<string, unknown>) : {}
    await savePushSubscription(db, actor, { endpoint: text(body.endpoint), p256dh: text(keys.p256dh), auth: text(keys.auth) })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}

/** Body: { endpoint }. */
export async function DELETE(request: Request) {
  try {
    const actor = await getActor()
    const body = await readJson(request)
    await removePushSubscription(db, actor, text(body.endpoint))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
