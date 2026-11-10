// Nhận biết môi trường PWA ở trình duyệt. Chỉ gọi phía client (trong useSyncExternalStore / sự kiện).

export function isIOS(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ tự nhận là Mac nhưng có cảm ứng
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Đang chạy như app đã thêm vào Màn hình chính (iOS: navigator.standalone; còn lại: display-mode). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/** Trình duyệt có thể đăng ký web push ở trạng thái hiện tại không. Trên iOS chỉ khi app đã ở chế độ standalone. */
export function canSubscribePush(): boolean {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  return isIOS() ? isStandalone() : true
}

/** applicationServerKey của pushManager.subscribe: khóa VAPID công khai dạng base64url → Uint8Array. */
export function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
