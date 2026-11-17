'use client'

import Link from 'next/link'
import { useRef, useState, type SubmitEvent } from 'react'
import { OTP_PATTERN, OTP_RULE_MESSAGE, PASSWORD_MAX, PASSWORD_MIN, PASSWORD_RULE_MESSAGE } from '@/lib/account-rules'
import { authClient } from '@/lib/auth-client'
import { looksLikeEmail, normalizeEmailInput, otpErrorMessage } from '@/lib/otp-errors'
import { useCooldown } from '@/lib/use-cooldown'
import { LoginError, LoginLinkButton, LoginOtpField, LoginPasswordField, LoginSubmit, LoginTextField } from '../login/_ui/login-fields'

const EMAIL_ID = 'forgot-email'
const OTP_ID = 'forgot-otp'
const PASS_ID = 'forgot-pass'
const ERROR_ID = 'forgot-error'
const RESEND_SECONDS = 60

type Step = { name: 'email' } | { name: 'reset'; email: string } | { name: 'done' }
type Problem = { message: string; field: 'email' | 'otp' | 'pass' | null }

const FIELD_ID = { email: EMAIL_ID, otp: OTP_ID, pass: PASS_ID } as const

/**
 * Quên mật khẩu bằng mã OTP 6 số gửi qua email:
 *  1. nhập email → máy chủ gửi mã nếu email có tài khoản (luôn trả "thành công" để không lộ email nào đã đăng ký);
 *  2. nhập mã + mật khẩu mới → đặt lại, mọi phiên đang đăng nhập bị thu hồi;
 *  3. quay về đăng nhập.
 */
export function ForgotPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState<Step>({ name: 'email' })
  const [problem, setProblem] = useState<Problem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [cooldown, startCooldown] = useCooldown()

  function fail(message: string, field: Problem['field']) {
    setProblem({ message, field })
    setNotice(null)
    if (field) document.getElementById(FIELD_ID[field])?.focus()
  }

  /** Gửi (hoặc gửi lại) mã. Trả true nếu máy chủ nhận yêu cầu. */
  async function requestCode(email: string): Promise<boolean> {
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email })
      if (error) {
        fail(otpErrorMessage(error), null)
        return false
      }
      startCooldown(RESEND_SECONDS)
      return true
    } catch {
      fail('Không kết nối được. Hãy kiểm tra mạng rồi thử lại', null)
      return false
    }
  }

  async function onSendCode(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = normalizeEmailInput(String(new FormData(e.currentTarget).get(EMAIL_ID) ?? ''))
    if (!looksLikeEmail(email)) return fail(email ? 'Email chưa đúng định dạng' : 'Hãy nhập email', 'email')
    setProblem(null)
    setPending(true)
    const ok = await requestCode(email)
    setPending(false)
    if (ok) setStep({ name: 'reset', email })
  }

  async function onResend(email: string) {
    if (cooldown > 0 || pending) return
    setProblem(null)
    setPending(true)
    const ok = await requestCode(email)
    setPending(false)
    if (ok) setNotice('Đã gửi mã mới')
  }

  async function onReset(e: SubmitEvent<HTMLFormElement>, email: string) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const otp = String(form.get(OTP_ID) ?? '')
    const password = String(form.get(PASS_ID) ?? '')
    if (!OTP_PATTERN.test(otp)) return fail(otp ? OTP_RULE_MESSAGE : 'Hãy nhập mã trong email', 'otp')
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return fail(PASSWORD_RULE_MESSAGE, 'pass')
    setProblem(null)
    setNotice(null)
    setPending(true)
    try {
      const { error } = await authClient.emailOtp.resetPassword({ email, otp, password })
      if (error) {
        fail(otpErrorMessage(error), error.code === 'PASSWORD_TOO_SHORT' || error.code === 'PASSWORD_TOO_LONG' ? 'pass' : 'otp')
        setPending(false)
        return
      }
      setStep({ name: 'done' })
    } catch {
      fail('Không kết nối được. Hãy kiểm tra mạng rồi thử lại', null)
    }
    setPending(false)
  }

  if (step.name === 'done') {
    return (
      <div className="flex flex-col gap-3 px-6 pt-4" role="status">
        <h2 className="m-0 text-[20px] font-bold">Đã đặt lại mật khẩu</h2>
        <Link
          href="/login?form"
          className="mt-1 flex h-[54px] items-center justify-center rounded-[27px] bg-accent text-[17px] font-bold text-on-solid no-underline shadow-[0_8px_24px_rgba(232,131,58,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Đăng nhập
        </Link>
      </div>
    )
  }

  if (step.name === 'reset') {
    const { email } = step
    return (
      <form ref={formRef} onSubmit={(e) => onReset(e, email)} noValidate aria-describedby={problem ? ERROR_ID : undefined} className="flex flex-col gap-3 px-6 pt-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[20px] font-bold">Kiểm tra email</h2>
          <p className="m-0 break-all text-[14px] leading-[1.5] text-muted">{email}</p>
        </div>
        <LoginOtpField id={OTP_ID} invalid={problem?.field === 'otp'} describedBy={ERROR_ID} />
        <LoginPasswordField id={PASS_ID} label="Mật khẩu mới" autoComplete="new-password" invalid={problem?.field === 'pass'} describedBy={ERROR_ID} />
        <LoginError id={ERROR_ID} message={problem?.message ?? null} />
        {notice && (
          <p role="status" className="m-0 text-[14px] font-medium text-accent-text">
            {notice}
          </p>
        )}
        <LoginSubmit pending={pending} label="Đặt lại mật khẩu" pendingLabel="Đang đặt lại…" />
        <div className="flex flex-wrap items-center justify-between">
          <LoginLinkButton onClick={() => onResend(email)} disabled={cooldown > 0 || pending}>
            {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}
          </LoginLinkButton>
          <LoginLinkButton
            onClick={() => {
              setProblem(null)
              setNotice(null)
              setStep({ name: 'email' })
            }}
          >
            Đổi email
          </LoginLinkButton>
        </div>
      </form>
    )
  }

  return (
    <form ref={formRef} onSubmit={onSendCode} noValidate aria-describedby={problem ? ERROR_ID : undefined} className="flex flex-col gap-3 px-6 pt-4">
      <h2 className="m-0 text-[20px] font-bold">Quên mật khẩu?</h2>
      <LoginTextField id={EMAIL_ID} label="Email" type="email" inputMode="email" autoComplete="email" placeholder="vd. minh@gmail.com" invalid={problem?.field === 'email'} describedBy={ERROR_ID} />
      <LoginError id={ERROR_ID} message={problem?.message ?? null} />
      <LoginSubmit pending={pending} label="Gửi mã" pendingLabel="Đang gửi mã…" />
    </form>
  )
}
