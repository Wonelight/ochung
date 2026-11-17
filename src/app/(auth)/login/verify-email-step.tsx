'use client'

import { useRef, useState, type SubmitEvent } from 'react'
import { OTP_PATTERN, OTP_RULE_MESSAGE } from '@/lib/account-rules'
import { authClient } from '@/lib/auth-client'
import { looksLikeEmail, normalizeEmailInput, otpErrorMessage } from '@/lib/otp-errors'
import { useCooldown } from '@/lib/use-cooldown'
import { LoginError, LoginLinkButton, LoginOtpField, LoginSubmit, LoginTextField } from './_ui/login-fields'

const EMAIL_ID = 'verify-email'
const OTP_ID = 'verify-otp'
const ERROR_ID = 'verify-error'
const RESEND_SECONDS = 60

/**
 * Bước nhập mã OTP 6 số để xác nhận email. Hai lối vào:
 *  - ngay sau khi đăng ký: `email` đã biết, mã vừa được gửi tới đó;
 *  - đăng nhập khi chưa xác nhận (đóng app giữa chừng): `email` là null, người dùng nhập lại email; đăng nhập đã tự gửi mã mới.
 * Nhập đúng mã là vào luôn (Better Auth tự tạo phiên), nên không cần nhập lại mật khẩu.
 */
export function VerifyEmailStep({
  email: knownEmail,
  onVerified,
  onBack,
  backLabel,
}: {
  email: string | null
  onVerified: () => void
  onBack: () => void
  backLabel: string
}) {
  const askEmail = knownEmail === null
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<{ message: string; field: 'email' | 'otp' | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sending, setSending] = useState(false)
  // vừa đăng ký xong thì mã vừa được gửi: chờ đủ thời gian rồi mới cho gửi lại
  const [cooldown, startCooldown] = useCooldown(askEmail ? 0 : RESEND_SECONDS)

  function readEmail(): string {
    if (!askEmail) return knownEmail
    const raw = new FormData(formRef.current ?? undefined).get(EMAIL_ID)
    return normalizeEmailInput(String(raw ?? ''))
  }

  function fail(message: string, field: 'email' | 'otp' | null) {
    setError({ message, field })
    setNotice(null)
    if (field) document.getElementById(field === 'email' ? EMAIL_ID : OTP_ID)?.focus()
  }

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = readEmail()
    const otp = String(new FormData(e.currentTarget).get(OTP_ID) ?? '')
    if (!looksLikeEmail(email)) return fail(email ? 'Email chưa đúng định dạng' : 'Hãy nhập email', 'email')
    if (!OTP_PATTERN.test(otp)) return fail(otp ? OTP_RULE_MESSAGE : 'Hãy nhập mã trong email', 'otp')
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp })
      if (error) {
        fail(otpErrorMessage(error), 'otp')
        setPending(false)
        return
      }
      onVerified()
    } catch {
      fail('Không kết nối được. Hãy kiểm tra mạng rồi thử lại', null)
      setPending(false)
    }
  }

  async function onResend() {
    if (cooldown > 0 || sending) return
    const email = readEmail()
    if (!looksLikeEmail(email)) return fail(email ? 'Email chưa đúng định dạng' : 'Hãy nhập email để nhận mã', 'email')
    setError(null)
    setSending(true)
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' })
      if (error) return fail(otpErrorMessage(error), null)
      startCooldown(RESEND_SECONDS)
      setNotice('Đã gửi mã mới')
    } catch {
      fail('Không kết nối được. Hãy kiểm tra mạng rồi thử lại', null)
    } finally {
      setSending(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-describedby={error ? ERROR_ID : undefined} className="flex flex-col gap-3 px-6 pt-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] font-bold">{askEmail ? 'Xác nhận email' : 'Kiểm tra email'}</h2>
        {!askEmail && <p className="m-0 break-all text-[14px] leading-[1.5] text-muted">{knownEmail}</p>}
      </div>
      {askEmail && (
        <LoginTextField id={EMAIL_ID} label="Email đã đăng ký" type="email" inputMode="email" autoComplete="email" placeholder="vd. minh@gmail.com" invalid={error?.field === 'email'} describedBy={ERROR_ID} />
      )}
      <LoginOtpField id={OTP_ID} invalid={error?.field === 'otp'} describedBy={ERROR_ID} />
      <LoginError id={ERROR_ID} message={error?.message ?? null} />
      {notice && (
        <p role="status" className="m-0 text-[14px] font-medium text-accent-text">
          {notice}
        </p>
      )}
      <LoginSubmit pending={pending} label="Xác nhận" pendingLabel="Đang xác nhận…" />
      <div className="flex flex-wrap items-center justify-between">
        <LoginLinkButton onClick={onResend} disabled={cooldown > 0 || sending}>
          {sending ? 'Đang gửi…' : cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}
        </LoginLinkButton>
        <LoginLinkButton onClick={onBack}>{backLabel}</LoginLinkButton>
      </div>
    </form>
  )
}
