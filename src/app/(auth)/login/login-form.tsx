'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { webAuthnSupported } from '@/lib/passkey-client'
import { FormError, PasswordField, PrimaryButton, TextField } from '../_ui/fields'

function loginErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === 'BANNED_USER') return 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên'
  if (error.status === 429) return 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại'
  return 'Sai tên đăng nhập hoặc mật khẩu'
}

function passkeyErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === 'BANNED_USER') return 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên'
  if (error.status === 429) return 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại'
  return 'Không đăng nhập được bằng Face ID. Hãy thử lại hoặc dùng mật khẩu'
}

/** `next` đã được lọc bằng safeNext ở trang (server) trước khi truyền xuống. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [passkeyPending, setPasskeyPending] = useState(false)
  const done = useRef(false)

  // Đăng nhập xong (mật khẩu hay Face ID): layout phía server sẽ đưa sang /doi-mat-khau nếu còn phải đổi mật khẩu,
  // nên đăng nhập bằng passkey cũng không lách được bước đổi mật khẩu tạm.
  function enter() {
    if (done.current) return
    done.current = true
    router.replace(next)
    router.refresh()
  }

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setPending(true)
    try {
      const { error } = await authClient.signIn.username({
        username: String(form.get('login-user') ?? '').trim(),
        password: String(form.get('login-pass') ?? ''),
      })
      if (error) {
        setError(loginErrorMessage(error))
        setPending(false)
        return
      }
      enter()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      setPending(false)
    }
  }

  async function onPasskey() {
    if (passkeyPending) return
    setError(null)
    if (!webAuthnSupported()) {
      setError('Thiết bị này chưa hỗ trợ Face ID. Hãy đăng nhập bằng mật khẩu')
      return
    }
    setPasskeyPending(true)
    try {
      const { error } = await authClient.signIn.passkey()
      if (error) {
        setError(passkeyErrorMessage(error))
        return
      }
      enter()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setPasskeyPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 px-6 pt-6">
      <TextField id="login-user" label="Tên đăng nhập" autoComplete="username webauthn" placeholder="vd. minh.pham" />
      <PasswordField id="login-pass" label="Mật khẩu" autoComplete="current-password webauthn" />
      <FormError message={error} />
      <PrimaryButton pending={pending} pendingLabel="Đang đăng nhập…">
        Đăng nhập
      </PrimaryButton>
      <button
        type="button"
        onClick={onPasskey}
        disabled={passkeyPending || pending}
        className="flex h-[54px] cursor-pointer items-center justify-center gap-2.5 rounded-[27px] border border-line2 bg-transparent font-[inherit] text-[16px] font-semibold text-text disabled:cursor-default disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="15" r="4" />
          <path d="m10.8 12.2 8.2-8.2" />
          <path d="m16 7 3 3" />
          <path d="m19 4 2 2" />
        </svg>
        {passkeyPending ? 'Đang chờ xác nhận…' : 'Đăng nhập bằng Face ID'}
      </button>
    </form>
  )
}
