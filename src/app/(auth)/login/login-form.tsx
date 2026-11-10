'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { FormError, PasswordField, PrimaryButton, TextField } from '../_ui/fields'

function loginErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === 'BANNED_USER') return 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên'
  if (error.status === 429) return 'Thử quá nhiều lần. Hãy đợi một lát rồi thử lại'
  return 'Sai tên đăng nhập hoặc mật khẩu'
}

/** `next` đã được lọc bằng safeNext ở trang (server) trước khi truyền xuống. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
      // layout phía server sẽ đưa sang /doi-mat-khau nếu còn phải đổi mật khẩu
      router.replace(next)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 px-6 pt-6">
      <TextField id="login-user" label="Tên đăng nhập" autoComplete="username" placeholder="vd. minh.pham" />
      <PasswordField id="login-pass" label="Mật khẩu" autoComplete="current-password" />
      <FormError message={error} />
      <PrimaryButton pending={pending} pendingLabel="Đang đăng nhập…">
        Đăng nhập
      </PrimaryButton>
      {/* Nút "Đăng nhập bằng Face ID" của mockup thêm ở Task 15 (cần passkey). */}
    </form>
  )
}
