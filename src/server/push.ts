import type { PushSender } from './period-events'

// Cầu nối tới dịch vụ push của trình duyệt qua gói `web-push` (v4, chỉ ESM, không có kiểu riêng: dùng @types/web-push).
// Khóa VAPID đọc từ biến môi trường; thiếu khóa (dev/e2e) thì bộ gửi là no-op trả 'ok'.

/** Gửi push cho một subscription. 404/410 từ dịch vụ push → 'gone' (người gọi xóa subscription); lỗi khác ném ra. */
type RawSend = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { TTL: number; urgency: 'normal'; timeout: number; vapidDetails: { subject: string; publicKey: string; privateKey: string } },
) => Promise<unknown>

const TTL_SECONDS = 24 * 60 * 60
const TIMEOUT_MS = 10_000

/** Dựng PushSender từ hàm gửi thô; tách riêng để test mà không cần mạng. */
export function createPushSender(
  raw: RawSend,
  vapid: { subject: string; publicKey: string; privateKey: string },
  isGone: (e: unknown) => boolean,
): PushSender {
  return async (sub, payload) => {
    try {
      await raw({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        TTL: TTL_SECONDS,
        urgency: 'normal',
        timeout: TIMEOUT_MS,
        vapidDetails: vapid,
      })
      return 'ok'
    } catch (e) {
      if (isGone(e)) return 'gone'
      // lỗi khác (mạng, 5xx, 403...) chỉ ghi log: một subscription hỏng không được chặn các thông báo khác
      console.error('Gửi web push thất bại', e)
      return 'ok'
    }
  }
}

/** Khóa công khai VAPID để trình duyệt đăng ký; null khi chưa cấu hình. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null
}

/** Bộ gửi mặc định: web-push thật khi đủ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT, ngược lại no-op trả 'ok'. */
export function getPushSender(): PushSender {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim()
  if (!publicKey || !privateKey || !subject) return async () => 'ok'
  return createPushSender(
    async (sub, payload, options) => {
      const webpush = await import('web-push') // nạp lười: tránh nạp gói khi không gửi
      return webpush.sendNotification(sub, payload, options)
    },
    { subject, publicKey, privateKey },
    (e) => {
      const status = (e as { statusCode?: unknown } | null)?.statusCode
      return status === 404 || status === 410
    },
  )
}
