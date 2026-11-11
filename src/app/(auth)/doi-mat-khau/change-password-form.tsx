'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { FormError, PasswordField, PrimaryButton } from '../_ui/fields'
import { changePasswordAction } from './actions'

const MIN_LENGTH = 8

/** `forced`: lần đăng nhập đầu (mật khẩu hiện tại là mật khẩu tạm, xong về Trang chủ); không thì mở từ Cài đặt (xong về Cài đặt). */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const currentPassword = String(form.get('pw-current') ?? '')
    const newPassword = String(form.get('pw-new') ?? '')
    const repeat = String(form.get('pw-repeat') ?? '')
    if (newPassword.length < MIN_LENGTH) return setError(`Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự`)
    if (newPassword !== repeat) return setError('Hai lần nhập mật khẩu mới chưa khớp')
    if (newPassword === currentPassword) return setError('Mật khẩu mới phải khác mật khẩu hiện tại')

    setError(null)
    setPending(true)
    try {
      const res = await changePasswordAction({ currentPassword, newPassword })
      if (!res.ok) {
        setError(res.message)
        setPending(false)
        return
      }
      router.replace(forced ? '/' : '/cai-dat')
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 px-6 pt-6">
      <PasswordField id="pw-current" label={forced ? 'Mật khẩu hiện tại (mật khẩu tạm)' : 'Mật khẩu hiện tại'} autoComplete="current-password" />
      <PasswordField id="pw-new" label="Mật khẩu mới (ít nhất 8 ký tự)" autoComplete="new-password" />
      <PasswordField id="pw-repeat" label="Nhập lại mật khẩu mới" autoComplete="new-password" />
      <FormError message={error} />
      <PrimaryButton pending={pending} pendingLabel="Đang lưu…">
        Đổi mật khẩu
      </PrimaryButton>
    </form>
  )
}
