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

export type AddPasskeyFailure = 'session-not-fresh' | 'already-registered' | 'other'

/**
 * Phân loại lỗi của `authClient.passkey.addPasskey`. Đăng ký passkey đòi phiên "còn mới" (Better Auth: freshAge mặc định 24 giờ,
 * giữ nguyên mặc định để an toàn): phiên cũ hơn bị máy chủ trả 403 SESSION_NOT_FRESH, khi đó chỉ đăng nhập lại mới giải quyết được.
 */
export function classifyAddPasskeyError(error: { code?: string; status?: number } | null | undefined): AddPasskeyFailure {
  if (!error) return 'other'
  if (error.code === 'SESSION_NOT_FRESH' || error.status === 403) return 'session-not-fresh'
  if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'already-registered'
  return 'other'
}

export const SESSION_NOT_FRESH_MESSAGE = 'Phiên đăng nhập đã lâu. Đăng xuất rồi đăng nhập lại để bật Face ID.'

/** Sau khi đăng xuất vì phiên cũ: về màn đăng nhập rồi quay lại Cài đặt (nơi có mục Face ID). */
export const RELOGIN_FOR_PASSKEY_HREF = '/login?next=%2Fcai-dat'
