// Quy tắc tài khoản dùng chung cho trang quản trị (admin tạo tài khoản), đăng ký công khai và đăng nhập Google.
// File thuần (không import gì của Node) vì cả trình duyệt cũng nạp để kiểm form trước khi gửi.

export const USERNAME_PATTERN = /^[a-z0-9_.]{2,30}$/
export const USERNAME_RULE_MESSAGE = 'Tên đăng nhập gồm 2–30 ký tự: chữ không dấu, số, dấu chấm hoặc gạch dưới'
export const DISPLAY_NAME_MAX = 50
export const DISPLAY_NAME_RULE_MESSAGE = 'Tên hiển thị gồm 1–50 ký tự'
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const PASSWORD_RULE_MESSAGE = `Mật khẩu phải từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự`

export const PLACEHOLDER_EMAIL_DOMAIN = 'nha.local'

/**
 * Tài khoản do quản trị viên cấp chưa có email thật nên Better Auth (bắt buộc có email) lưu email giả này.
 * Không bao giờ gửi thư tới đó; đăng ký công khai bị cấm dùng đuôi này (xem hook trong auth.ts).
 */
export function placeholderEmail(username: string): string {
  return `${username}@${PLACEHOLDER_EMAIL_DOMAIN}`
}

export function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
}

/** Mã OTP xác nhận email: đúng 6 chữ số. */
export const OTP_PATTERN = /^\d{6}$/
export const OTP_RULE_MESSAGE = 'Mã gồm 6 chữ số'
