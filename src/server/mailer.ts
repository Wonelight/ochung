import nodemailer, { type Transporter } from 'nodemailer'

// Gửi thư qua SMTP (Gmail + App Password). Toàn bộ việc gửi thư của app đi qua `sendMail`, nên sau này đổi sang dịch vụ khác
// (Resend, Brevo...) chỉ cần sửa file này.
//
// Biến môi trường: SMTP_USER (địa chỉ Gmail gửi), SMTP_PASS (App Password 16 ký tự, dấu cách được bỏ qua),
// tùy chọn SMTP_HOST (mặc định smtp.gmail.com), SMTP_PORT (mặc định 465, bảo mật TLS), SMTP_FROM_NAME (mặc định "Chi tiêu nhà").

export type Mail = { to: string; subject: string; text: string; html: string }
export type SendMail = (mail: Mail) => Promise<void>

type SmtpConfig = { host: string; port: number; user: string; pass: string; fromName: string }

function smtpConfig(): SmtpConfig | null {
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, '')
  if (!user || !pass) return null
  return {
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    user,
    pass,
    fromName: process.env.SMTP_FROM_NAME?.trim() || 'Chi tiêu nhà',
  }
}

export function smtpConfigured(): boolean {
  return smtpConfig() !== null
}

let cached: { key: string; transporter: Transporter } | null = null

function transporterFor(cfg: SmtpConfig): Transporter {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}`
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
        // không để một lần SMTP treo giữ cả hàm serverless
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      }),
    }
  }
  return cached.transporter
}

/**
 * Gửi một thư. Chưa cấu hình SMTP: khi chạy dev thì in thư ra console (để thử luồng đăng ký mà không cần Gmail),
 * còn production thì báo lỗi rõ ràng thay vì lặng lẽ không gửi.
 */
export const sendMail: SendMail = async (mail) => {
  const cfg = smtpConfig()
  if (!cfg) {
    if (process.env.NODE_ENV === 'production') throw new Error('Chưa cấu hình SMTP_USER / SMTP_PASS nên không gửi được email')
    console.info(`[mail:dev] tới ${mail.to} — ${mail.subject}\n${mail.text}`)
    return
  }
  await transporterFor(cfg).sendMail({ from: { name: cfg.fromName, address: cfg.user }, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
}
