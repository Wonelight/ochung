'use client'

import { useState, type InputEvent, type SubmitEvent } from 'react'
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_RULE_MESSAGE,
  isPlaceholderEmail,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_RULE_MESSAGE,
  USERNAME_PATTERN,
  USERNAME_RULE_MESSAGE,
} from '@/lib/account-rules'
import { authClient } from '@/lib/auth-client'
import { looksLikeEmail, normalizeEmailInput } from '@/lib/otp-errors'
import { LoginError, LoginPasswordField, LoginSubmit, LoginTextField } from './_ui/login-fields'
import { VerifyEmailStep } from './verify-email-step'

const NAME_ID = 'register-name'
const EMAIL_ID = 'register-email'
const USER_ID = 'register-user'
const PASS_ID = 'register-pass'
const ERROR_ID = 'register-error'

type Field = 'name' | 'email' | 'user' | 'pass'
type FormErrorState = { message: string; hint?: string; invalid: Field | null }

const FIELD_ID: Record<Field, string> = { name: NAME_ID, email: EMAIL_ID, user: USER_ID, pass: PASS_ID }

function registerError(error: { code?: string; status?: number }): FormErrorState {
  switch (error.code) {
    case 'USERNAME_IS_ALREADY_TAKEN':
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return { message: 'Tên đăng nhập này đã có người dùng', hint: 'Hãy chọn tên khác, hoặc đăng nhập nếu đó là tài khoản của bạn.', invalid: 'user' }
    case 'USERNAME_FORMAT':
      return { message: USERNAME_RULE_MESSAGE, invalid: 'user' }
    case 'DISPLAY_NAME':
      return { message: DISPLAY_NAME_RULE_MESSAGE, invalid: 'name' }
    case 'INVALID_EMAIL':
      return { message: 'Email chưa đúng định dạng', invalid: 'email' }
    case 'EMAIL_RESERVED':
      return { message: 'Hãy dùng email thật của bạn', invalid: 'email' }
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return { message: PASSWORD_RULE_MESSAGE, invalid: 'pass' }
  }
  if (error.status === 429) return { message: 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại', invalid: null }
  return { message: 'Chưa tạo được tài khoản. Hãy thử lại', invalid: null }
}

/**
 * Tự tạo tài khoản: bước 1 nhập tên hiển thị, email, tên đăng nhập, mật khẩu; bước 2 nhập mã 6 số gửi tới email.
 * Nhập đúng mã là vào luôn. Chưa nhập mã thì chưa đăng nhập được (và đăng ký lại bằng cùng email/tên vẫn được).
 */
export function RegisterForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<FormErrorState | null>(null)
  const [pending, setPending] = useState(false)
  /** Đã gửi mã tới email này: chuyển sang bước nhập mã. */
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)

  function fail(e: FormErrorState) {
    setError(e)
    if (e.invalid) document.getElementById(FIELD_ID[e.invalid])?.focus()
  }

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get(NAME_ID) ?? '').trim()
    const email = normalizeEmailInput(String(form.get(EMAIL_ID) ?? ''))
    const username = String(form.get(USER_ID) ?? '').trim().toLowerCase()
    const password = String(form.get(PASS_ID) ?? '')
    // Kiểm sơ bộ ngay trên máy để báo đúng ô; máy chủ vẫn kiểm lại đủ các điều này.
    if (name.length < 1 || name.length > DISPLAY_NAME_MAX) return fail({ message: name ? DISPLAY_NAME_RULE_MESSAGE : 'Hãy nhập tên hiển thị', invalid: 'name' })
    if (!looksLikeEmail(email)) return fail({ message: email ? 'Email chưa đúng định dạng' : 'Hãy nhập email', invalid: 'email' })
    if (isPlaceholderEmail(email)) return fail({ message: 'Hãy dùng email thật của bạn', invalid: 'email' })
    if (!USERNAME_PATTERN.test(username)) return fail({ message: username ? USERNAME_RULE_MESSAGE : 'Hãy nhập tên đăng nhập', invalid: 'user' })
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return fail({ message: PASSWORD_RULE_MESSAGE, invalid: 'pass' })

    setError(null)
    setPending(true)
    try {
      const { error } = await authClient.signUp.email({ email, password, name, username })
      if (error) {
        fail(registerError(error))
        setPending(false)
        return
      }
      setVerifyEmail(email) // mã OTP đã được gửi tới email này
      setPending(false)
    } catch {
      setError({ message: 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại', invalid: null })
      setPending(false)
    }
  }

  // Gõ lại vào ô đang bị đánh dấu sai thì bỏ đánh dấu ô đó (dòng lỗi vẫn còn tới lần gửi sau).
  function onInput(e: InputEvent<HTMLFormElement>) {
    if (error?.invalid && (e.target as HTMLElement).id === FIELD_ID[error.invalid]) setError({ ...error, invalid: null })
  }

  if (verifyEmail !== null) {
    return <VerifyEmailStep email={verifyEmail} onVerified={onDone} onBack={() => setVerifyEmail(null)} backLabel="Đổi email" />
  }

  const invalid = error?.invalid ?? null
  return (
    <form onSubmit={onSubmit} onInput={onInput} noValidate aria-describedby={error ? ERROR_ID : undefined} className="flex flex-col gap-3 px-6 pt-4">
      <LoginTextField
        id={NAME_ID}
        label="Tên hiển thị"
        autoComplete="name"
        autoCapitalize="words"
        placeholder="vd. Minh Phạm"
        maxLength={DISPLAY_NAME_MAX}
        invalid={invalid === 'name'}
        describedBy={ERROR_ID}
      />
      <LoginTextField
        id={EMAIL_ID}
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="vd. minh@gmail.com"
        invalid={invalid === 'email'}
        describedBy={ERROR_ID}
      />
      <LoginTextField
        id={USER_ID}
        label="Tên đăng nhập"
        autoComplete="username"
        placeholder="vd. minh.pham"
        maxLength={30}
        invalid={invalid === 'user'}
        describedBy={ERROR_ID}
      />
      <LoginPasswordField id={PASS_ID} label="Mật khẩu" autoComplete="new-password" invalid={invalid === 'pass'} describedBy={ERROR_ID} />
      <LoginError id={ERROR_ID} message={error?.message ?? null} hint={error?.hint} />
      <LoginSubmit pending={pending} label="Tạo tài khoản" pendingLabel="Đang gửi mã…" />
    </form>
  )
}
