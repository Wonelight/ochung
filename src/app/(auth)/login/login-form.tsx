'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type InputEvent, type SubmitEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { webAuthnSupported } from '@/lib/passkey-client'
import { GoogleButton, LoginError, LoginPasswordField, LoginSubmit, LoginTextField, OrDivider, PasskeyButton } from './_ui/login-fields'
import { RegisterForm } from './register-form'
import { VerifyEmailStep } from './verify-email-step'

const USER_ID = 'login-user'
const PASS_ID = 'login-pass'
const ERROR_ID = 'login-error'

/** Ô nào bị đánh dấu sai: một ô (bỏ trống) hoặc cả hai (sai tên/mật khẩu). */
type Invalid = 'user' | 'pass' | 'both' | null
type FormErrorState = { message: string; hint?: string; invalid: Invalid }

function loginError(error: { code?: string; status?: number }): FormErrorState {
  if (error.code === 'BANNED_USER') return { message: 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên', invalid: null }
  if (error.status === 429) return { message: 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại', invalid: null }
  return {
    message: 'Sai tên đăng nhập hoặc mật khẩu',
    hint: 'Quên mật khẩu? Dùng liên kết bên dưới ô mật khẩu.',
    invalid: 'both',
  }
}

function passkeyErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === 'BANNED_USER') return 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên'
  if (error.status === 429) return 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại'
  return 'Không đăng nhập được bằng Face ID. Hãy thử lại hoặc dùng mật khẩu'
}

/** Mã lỗi Better Auth gắn vào `?error=` khi đăng nhập Google hỏng giữa chừng. */
function googleErrorMessage(code: string | null): string {
  if (code === 'access_denied') return 'Bạn đã hủy đăng nhập bằng Google'
  if (code === 'account_not_linked') return 'Email Google này chưa gắn với tài khoản nào. Hãy đăng nhập bằng tên đăng nhập rồi liên kết Google trong Cài đặt'
  return 'Không đăng nhập được bằng Google. Hãy thử lại'
}

/**
 * Đăng nhập hoặc tự tạo tài khoản (tên đăng nhập + mật khẩu), kèm nút Google khi máy chủ đã có khóa Google.
 * `next` đã được lọc bằng safeNext ở trang (server) trước khi truyền xuống.
 * `oauthError`: mã lỗi Google trả về qua `?error=` (nếu có), hiện ngay khi mở form.
 */
export function LoginForm({ next, googleEnabled, oauthError }: { next: string; googleEnabled: boolean; oauthError: string | null }) {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [googleError, setGoogleError] = useState<string | null>(oauthError === null ? null : googleErrorMessage(oauthError))
  const [googlePending, setGooglePending] = useState(false)
  const done = useRef(false)

  // Vào xong (mật khẩu, Face ID hay tạo tài khoản mới): layout phía server sẽ đưa sang /change-password nếu còn phải đổi mật khẩu
  // (chỉ tài khoản quản trị viên cấp), nên đăng nhập bằng passkey cũng không lách được bước đổi mật khẩu tạm.
  function enter() {
    if (done.current) return
    done.current = true
    router.replace(next)
    router.refresh()
  }

  async function onGoogle() {
    if (googlePending) return
    setGoogleError(null)
    setGooglePending(true)
    const back = next === '/' ? '/login?form' : `/login?form&next=${encodeURIComponent(next)}`
    try {
      // thành công thì trình duyệt được chuyển sang Google, trang này không cần làm gì thêm
      const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: next, newUserCallbackURL: next, errorCallbackURL: back })
      if (error) {
        setGoogleError(error.status === 429 ? 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại' : googleErrorMessage(null))
        setGooglePending(false)
      }
    } catch {
      setGoogleError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      setGooglePending(false)
    }
  }

  const registering = mode === 'register'
  return (
    <div className="flex flex-col pb-[max(32px,env(safe-area-inset-bottom))]">
      {registering ? <RegisterForm onDone={enter} /> : <SignInForm onDone={enter} />}
      <div className="flex flex-col gap-3 px-6 pt-3">
        {googleEnabled && (
          <>
            <OrDivider />
            <GoogleButton onClick={onGoogle} disabled={googlePending}>
              {googlePending ? 'Đang chuyển sang Google…' : 'Tiếp tục với Google'}
            </GoogleButton>
            <LoginError id="google-error" message={googleError} />
          </>
        )}
        <p className="m-0 text-center text-[14px] text-muted">
          {registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
          <button
            type="button"
            onClick={() => setMode(registering ? 'login' : 'register')}
            className="min-h-11 cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-[14px] font-semibold text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {registering ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </p>
      </div>
    </div>
  )
}

function SignInForm({ onDone: enter }: { onDone: () => void }) {
  const [error, setError] = useState<FormErrorState | null>(null)
  const [pending, setPending] = useState(false)
  const [passkeyPending, setPasskeyPending] = useState(false)
  /** Mật khẩu đúng nhưng email chưa xác nhận (đã đăng ký mà chưa nhập mã): chuyển sang bước nhập mã. */
  const [unverified, setUnverified] = useState(false)

  // Tự điền: bấm vào ô tên đăng nhập, iOS/Chrome gợi ý passkey ngay trên bàn phím (autocomplete "… webauthn").
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        if (!webAuthnSupported() || !(await PublicKeyCredential.isConditionalMediationAvailable?.())) return
        const res = await authClient.signIn.passkey({ autoFill: true })
        // lỗi (người dùng bỏ qua, hoặc lượt này bị lượt đăng nhập khác thay thế) thì im lặng
        if (!cancelled && !res.error) enter()
      } catch {
        // trình duyệt không cho chạy: người dùng vẫn đăng nhập bằng mật khẩu
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bỏ trống: báo bằng tiếng Việt ngay tại form (thay bong bóng mặc định của trình duyệt) và đưa con trỏ về ô thiếu.
  // Quy tắc giữ nguyên: cả hai ô bắt buộc; máy chủ vẫn kiểm tra như cũ.
  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get(USER_ID) ?? '').trim()
    const password = String(form.get(PASS_ID) ?? '')
    if (!username || !password) {
      const missing: Invalid = !username ? 'user' : 'pass'
      setError({ message: !username ? 'Hãy nhập tên đăng nhập' : 'Hãy nhập mật khẩu', invalid: missing })
      document.getElementById(missing === 'user' ? USER_ID : PASS_ID)?.focus()
      return
    }
    setError(null)
    setPending(true)
    try {
      const { error } = await authClient.signIn.username({ username, password })
      if (error) {
        if (error.code === 'EMAIL_NOT_VERIFIED') setUnverified(true) // máy chủ đã gửi mã mới tới email đăng ký
        else setError(loginError(error))
        setPending(false)
        return
      }
      enter()
    } catch {
      setError({ message: 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại', invalid: null })
      setPending(false)
    }
  }

  async function onPasskey() {
    if (passkeyPending) return
    setError(null)
    if (!webAuthnSupported()) {
      setError({ message: 'Thiết bị này chưa hỗ trợ Face ID. Hãy đăng nhập bằng mật khẩu', invalid: null })
      return
    }
    setPasskeyPending(true)
    try {
      const { error } = await authClient.signIn.passkey()
      if (error) {
        setError({ message: passkeyErrorMessage(error), invalid: null })
        return
      }
      enter()
    } catch {
      setError({ message: 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại', invalid: null })
    } finally {
      setPasskeyPending(false)
    }
  }

  // Gõ lại vào ô đang bị đánh dấu sai thì bỏ đánh dấu ô đó (dòng lỗi vẫn còn tới lần gửi sau).
  function onInput(e: InputEvent<HTMLFormElement>) {
    if (!error?.invalid) return
    const id = (e.target as HTMLElement).id
    const rest: Invalid =
      error.invalid === 'both' ? (id === USER_ID ? 'pass' : 'user') : error.invalid === (id === USER_ID ? 'user' : 'pass') ? null : error.invalid
    if (rest !== error.invalid) setError({ ...error, invalid: rest })
  }

  if (unverified) {
    return <VerifyEmailStep email={null} onVerified={enter} onBack={() => setUnverified(false)} backLabel="Quay lại đăng nhập" />
  }

  const invalid = error?.invalid ?? null
  return (
    <form onSubmit={onSubmit} onInput={onInput} noValidate aria-describedby={error ? ERROR_ID : undefined} className="flex flex-col gap-3 px-6 pt-4">
      <LoginTextField
        id={USER_ID}
        label="Tên đăng nhập"
        autoComplete="username webauthn"
        placeholder="vd. minh.pham"
        invalid={invalid === 'user' || invalid === 'both'}
        describedBy={ERROR_ID}
      />
      <LoginPasswordField
        id={PASS_ID}
        label="Mật khẩu"
        autoComplete="current-password webauthn"
        invalid={invalid === 'pass' || invalid === 'both'}
        describedBy={ERROR_ID}
      />
      <Link
        href="/forgot-password"
        className="-mt-1.5 flex min-h-11 items-center self-end px-1 text-[14px] font-semibold text-accent-text no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Quên mật khẩu?
      </Link>
      <LoginError id={ERROR_ID} message={error?.message ?? null} hint={error?.hint} />
      <LoginSubmit pending={pending} />
      <PasskeyButton onClick={onPasskey} disabled={passkeyPending || pending}>
        {passkeyPending ? 'Đang chờ xác nhận…' : 'Đăng nhập bằng Face ID'}
      </PasskeyButton>
    </form>
  )
}
