import type { Mail } from './mailer'

// Nội dung các thư của app (tiếng Việt). Mã OTP là 6 chữ số, hiệu lực OTP_MINUTES phút.

export const OTP_MINUTES = 10

export type OtpKind = 'email-verification' | 'forget-password' | 'change-email' | 'sign-in'

const COPY: Record<OtpKind, { subject: string; lead: string }> = {
  'email-verification': { subject: 'Mã xác nhận đăng ký Chi tiêu nhà', lead: 'Dùng mã dưới đây để xác nhận email và hoàn tất đăng ký tài khoản.' },
  'forget-password': { subject: 'Mã đặt lại mật khẩu Chi tiêu nhà', lead: 'Dùng mã dưới đây để đặt lại mật khẩu cho tài khoản của bạn.' },
  'change-email': { subject: 'Mã xác nhận email khôi phục Chi tiêu nhà', lead: 'Dùng mã dưới đây để xác nhận email này làm email khôi phục cho tài khoản của bạn.' },
  'sign-in': { subject: 'Mã đăng nhập Chi tiêu nhà', lead: 'Dùng mã dưới đây để đăng nhập.' },
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Khung thư đơn giản, một cột, chữ to dễ đọc trên điện thoại; không phụ thuộc ảnh hay CSS ngoài (nhiều ứng dụng thư chặn). */
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px 16px;background:#f5f1ea;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #e7e0d4">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#a8731f;font-weight:600">Chi tiêu nhà</p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
${bodyHtml}
</div></body></html>`
}

export function renderOtpMail(to: string, kind: OtpKind, otp: string): Mail {
  const { subject, lead } = COPY[kind]
  const text = `${lead}\n\nMã của bạn: ${otp}\n\nMã có hiệu lực trong ${OTP_MINUTES} phút. Đừng chia sẻ mã này cho bất kỳ ai, kể cả người tự nhận là quản trị viên.\nNếu bạn không yêu cầu, hãy bỏ qua thư này.`
  const html = layout(
    subject,
    `<p style="margin:0 0 18px;font-size:15px;line-height:1.55">${escapeHtml(lead)}</p>
<p style="margin:0 0 18px;text-align:center;font-size:34px;font-weight:700;letter-spacing:.32em;font-family:ui-monospace,Menlo,Consolas,monospace;background:#fbf6ec;border-radius:12px;padding:16px 0">${escapeHtml(otp)}</p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#57534e">Mã có hiệu lực trong ${OTP_MINUTES} phút. Đừng chia sẻ mã này cho bất kỳ ai, kể cả người tự nhận là quản trị viên.</p>
<p style="margin:0;font-size:13px;line-height:1.55;color:#57534e">Nếu bạn không yêu cầu, hãy bỏ qua thư này.</p>`,
  )
  return { to, subject, text, html }
}

/** Gửi tới chủ email khi có người đăng ký bằng đúng email đó (đã có tài khoản): không lộ gì cho người đăng ký. */
export function renderExistingAccountMail(to: string): Mail {
  const subject = 'Có người đăng ký Chi tiêu nhà bằng email của bạn'
  const text =
    'Có người vừa thử tạo tài khoản Chi tiêu nhà bằng email này, nhưng email đã có tài khoản.\n\nNếu là bạn, hãy đăng nhập, hoặc dùng "Quên mật khẩu" ở màn đăng nhập nếu quên mật khẩu.\nNếu không phải bạn, không cần làm gì.'
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Có người vừa thử tạo tài khoản bằng email này, nhưng email đã có tài khoản.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Nếu là bạn, hãy đăng nhập, hoặc dùng “Quên mật khẩu” ở màn đăng nhập nếu quên mật khẩu.</p>
<p style="margin:0;font-size:13px;line-height:1.55;color:#57534e">Nếu không phải bạn, không cần làm gì.</p>`,
  )
  return { to, subject, text, html }
}
