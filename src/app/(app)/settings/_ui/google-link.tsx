'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { ErrorText, secondaryButtonClass } from '../../house/_ui/settings-parts'

/**
 * Liên kết tài khoản Google vào tài khoản đang đăng nhập (kể cả tài khoản cũ dùng email giả): lần sau bấm "Tiếp tục với Google"
 * ở màn đăng nhập là vào đúng tài khoản này. Đã liên kết thì chỉ báo trạng thái. Xong (hay hủy giữa chừng) thì Google đưa về lại /settings.
 */
export function GoogleLink({ linked }: { linked: boolean }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function onLink() {
    if (pending) return
    setPending(true)
    setError('')
    try {
      // thành công thì trình duyệt được chuyển sang Google rồi quay lại /settings
      const { error } = await authClient.linkSocial({ provider: 'google', callbackURL: '/settings', errorCallbackURL: '/settings' })
      if (error) {
        setError('Chưa liên kết được Google. Hãy thử lại')
        setPending(false)
      }
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-semibold">Đăng nhập bằng Google</h2>
        <p className="m-0 text-[13px] leading-snug text-muted">
          {linked ? 'Đã liên kết. Ở màn đăng nhập, bấm “Tiếp tục với Google”.' : 'Liên kết để lần sau vào bằng một chạm.'}
        </p>
      </div>
      {!linked && (
        <button type="button" onClick={onLink} disabled={pending} className={secondaryButtonClass}>
          {pending ? 'Đang chuyển sang Google…' : 'Liên kết Google'}
        </button>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  )
}
