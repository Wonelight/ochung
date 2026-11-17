'use client'

import { useRouter } from 'next/navigation'
import { useState, type SubmitEvent } from 'react'
import { OTP_PATTERN, OTP_RULE_MESSAGE, isPlaceholderEmail } from '@/lib/account-rules'
import { authClient } from '@/lib/auth-client'
import { looksLikeEmail, normalizeEmailInput, otpErrorMessage } from '@/lib/otp-errors'
import { useCooldown } from '@/lib/use-cooldown'
import { ErrorText, FieldLabel, NoticeText, ghostButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from '../../house/_ui/settings-parts'

const RESEND_SECONDS = 60

type Step = { name: 'idle' } | { name: 'enter' } | { name: 'code'; email: string }

/**
 * "Email khôi phục": email thật dùng để lấy lại mật khẩu (Quên mật khẩu) và nhận mã. Tài khoản quản trị viên cấp chỉ có email giả
 * nên bắt đầu từ "Chưa có"; thêm xong thì tự dùng được "Quên mật khẩu". Thêm/đổi qua mã 6 số gửi tới chính email mới.
 */
export function EmailManager({ email }: { email: string | null }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [cooldown, startCooldown] = useCooldown()

  const hasEmail = email !== null && !isPlaceholderEmail(email)

  function failure(e: { code?: string; status?: number }): string {
    // phiên cũ quá thì máy chủ đòi đăng nhập lại cho thao tác nhạy cảm
    if (e.status === 401 || e.status === 403) return 'Phiên đăng nhập đã cũ. Hãy đăng xuất rồi đăng nhập lại để đổi email'
    return otpErrorMessage(e)
  }

  async function sendCode(newEmail: string): Promise<boolean> {
    try {
      const { error } = await authClient.emailOtp.requestEmailChange({ newEmail })
      if (error) {
        setError(failure(error))
        return false
      }
      startCooldown(RESEND_SECONDS)
      return true
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      return false
    }
  }

  async function onEnter(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const newEmail = normalizeEmailInput(String(new FormData(e.currentTarget).get('new-email') ?? ''))
    if (!looksLikeEmail(newEmail)) return setError(newEmail ? 'Email chưa đúng định dạng' : 'Hãy nhập email')
    if (isPlaceholderEmail(newEmail)) return setError('Hãy dùng email thật của bạn')
    if (newEmail === email) return setError('Đây đang là email khôi phục của bạn')
    setError('')
    setNotice('')
    setPending(true)
    const ok = await sendCode(newEmail)
    setPending(false)
    if (ok) setStep({ name: 'code', email: newEmail })
  }

  async function onResend(newEmail: string) {
    if (cooldown > 0 || pending) return
    setError('')
    setPending(true)
    const ok = await sendCode(newEmail)
    setPending(false)
    if (ok) setNotice('Đã gửi mã mới')
  }

  async function onConfirm(e: SubmitEvent<HTMLFormElement>, newEmail: string) {
    e.preventDefault()
    const otp = String(new FormData(e.currentTarget).get('email-otp') ?? '')
    if (!OTP_PATTERN.test(otp)) return setError(otp ? OTP_RULE_MESSAGE : 'Hãy nhập mã trong email')
    setError('')
    setNotice('')
    setPending(true)
    try {
      const { error } = await authClient.emailOtp.changeEmail({ newEmail, otp })
      if (error) {
        setError(failure(error))
        setPending(false)
        return
      }
      setStep({ name: 'idle' })
      setNotice(`Đã lưu email khôi phục: ${newEmail}`)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    }
    setPending(false)
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-semibold">Email khôi phục</h2>
        <p className="m-0 text-[13px] leading-snug text-muted">
          {hasEmail ? (
            <>
              Dùng để lấy lại mật khẩu: <strong className="break-all font-semibold text-text">{email}</strong>
            </>
          ) : (
            'Chưa có. Thêm email để tự lấy lại mật khẩu khi quên.'
          )}
        </p>
      </div>

      {step.name === 'idle' && (
        <button
          type="button"
          onClick={() => {
            setError('')
            setNotice('')
            setStep({ name: 'enter' })
          }}
          className={secondaryButtonClass}
        >
          {hasEmail ? 'Đổi email' : 'Thêm email'}
        </button>
      )}

      {step.name === 'enter' && (
        <form onSubmit={onEnter} noValidate className="flex flex-col gap-2.5">
          <FieldLabel htmlFor="new-email">Email mới</FieldLabel>
          <input id="new-email" name="new-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="vd. minh@gmail.com" className={inputClass} />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={`${primaryButtonClass} flex-1`}>
              {pending ? 'Đang gửi mã…' : 'Gửi mã'}
            </button>
            <button type="button" onClick={() => setStep({ name: 'idle' })} className={ghostButtonClass}>
              Hủy
            </button>
          </div>
        </form>
      )}

      {step.name === 'code' && (
        <form onSubmit={(e) => onConfirm(e, step.email)} noValidate className="flex flex-col gap-2.5">
          <p className="m-0 break-all text-[13px] leading-snug text-muted">Mã đã gửi tới {step.email}</p>
          <FieldLabel htmlFor="email-otp">Mã 6 số</FieldLabel>
          <input
            id="email-otp"
            name="email-otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            onInput={(e) => {
              e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 6)
            }}
            className={`${inputClass} text-center font-numeric text-[22px] font-semibold tracking-[0.5em]`}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={`${primaryButtonClass} flex-1`}>
              {pending ? 'Đang xác nhận…' : 'Xác nhận'}
            </button>
            <button type="button" disabled={cooldown > 0 || pending} onClick={() => onResend(step.email)} className={ghostButtonClass}>
              {cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại mã'}
            </button>
          </div>
          <button type="button" onClick={() => setStep({ name: 'enter' })} className="h-11 cursor-pointer self-start border-0 bg-transparent px-1 font-[inherit] text-[14px] font-semibold text-accent-text">
            Đổi email khác
          </button>
        </form>
      )}

      <ErrorText>{error}</ErrorText>
      <NoticeText>{notice}</NoticeText>
    </section>
  )
}
