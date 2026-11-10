// Phía trình duyệt: giữ subscription web push của thiết bị này khớp với người đang đăng nhập.
// Subscription gắn với thiết bị chứ không phải tài khoản, nên khi đổi người dùng trên cùng máy: (1) đăng xuất phải gỡ nó
// (`detachPushSubscription`), (2) khi mở app, subscription còn lại phải được gắn lại cho người đang đăng nhập (`claimPushSubscription`).

export const PUSH_API = '/api/push/subscribe'
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const DETACH_TIMEOUT_MS = 4000

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

/**
 * Gọi TRƯỚC khi đăng xuất (cần cookie phiên): xóa subscription của thiết bị này khỏi máy chủ rồi hủy nó trên trình duyệt,
 * để thông báo có số tiền không còn gửi tới thiết bị mà người khác sắp dùng. Không bao giờ ném lỗi và không chờ quá
 * vài giây: đăng xuất không được bị chặn vì push.
 */
export async function detachPushSubscription(): Promise<void> {
  const run = async () => {
    const sub = await currentSubscription()
    if (!sub) return
    await fetch(PUSH_API, { method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined)
    await sub.unsubscribe().catch(() => false)
  }
  try {
    await Promise.race([run(), new Promise<void>((resolve) => setTimeout(resolve, DETACH_TIMEOUT_MS))])
  } catch {
    // bỏ qua: đây chỉ là dọn dẹp tốt nhất có thể
  }
}

/**
 * Gắn subscription hiện có của trình duyệt cho người đang đăng nhập (máy chủ ghi đè chủ sở hữu theo endpoint).
 * Trả true nếu thiết bị đang có subscription hợp lệ thuộc về người này.
 */
export async function claimPushSubscription(): Promise<boolean> {
  const sub = await currentSubscription()
  if (!sub) return false
  const res = await fetch(PUSH_API, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(sub.toJSON()) })
  return res.ok
}
