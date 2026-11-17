/** Thông báo tiếng Việt cho lỗi của các thao tác nhập mã OTP (xác nhận email, đặt lại mật khẩu, đổi email). */
export function otpErrorMessage(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case 'INVALID_OTP':
      return 'Mã không đúng. Hãy kiểm tra lại mã trong email'
    case 'OTP_EXPIRED':
      return 'Mã đã hết hạn. Hãy bấm "Gửi lại mã" để nhận mã mới'
    case 'TOO_MANY_ATTEMPTS':
      return 'Nhập sai quá nhiều lần. Hãy bấm "Gửi lại mã" để nhận mã mới'
    case 'INVALID_EMAIL':
      return 'Email chưa đúng định dạng'
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return 'Mật khẩu phải từ 8 đến 128 ký tự'
  }
  if (error.status === 429) return 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại'
  return 'Chưa thực hiện được. Hãy thử lại'
}

/** Email nhập tay: bỏ khoảng trắng hai đầu, chữ thường. Kiểm định dạng thật sự do máy chủ làm. */
export function normalizeEmailInput(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Chỉ cần "có dạng email" để báo đúng ô sớm; không cố bắt chước đầy đủ chuẩn email. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}
