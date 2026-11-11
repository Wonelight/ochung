// Phía trình duyệt cho Face ID (passkey): nhận biết thiết bị, đặt tên khóa, nhớ việc đã từ chối lời mời bật.
// Mọi truy cập localStorage đều bọc try/catch: chế độ riêng tư hoặc bị chặn dữ liệu sẽ ném lỗi, app vẫn phải chạy.

/** Trình duyệt có WebAuthn không (điều kiện tối thiểu để thử đăng ký/đăng nhập passkey). */
export function webAuthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
}

/** Tên gợi nhớ của khóa theo thiết bị đang dùng, hiện trong danh sách Face ID ở Cài đặt. */
export function passkeyDeviceName(userAgent: string): string {
  if (/iPhone|iPod/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return 'Android'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows'
  return 'Thiết bị này'
}

const DISMISS_PREFIX = 'passkey-prompt-dismissed:'

/** Người này đã từ chối (hoặc đã bật) lời mời Face ID trên thiết bị này chưa. */
export function passkeyPromptDismissed(userId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(DISMISS_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

export function dismissPasskeyPrompt(userId: string, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(DISMISS_PREFIX + userId, '1')
  } catch {
    // không lưu được: lần sau có thể hỏi lại, chấp nhận
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
