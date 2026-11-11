'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import {
  RELOGIN_FOR_PASSKEY_HREF,
  SESSION_NOT_FRESH_MESSAGE,
  classifyAddPasskeyError,
  dismissPasskeyPrompt,
  passkeyDeviceName,
  passkeyPromptDismissed,
  webAuthnSupported,
} from '@/lib/passkey-client'
import { signOutClient } from '@/lib/sign-out'
import { ConfirmSheet } from './ConfirmSheet'

/**
 * Lời mời "Bật đăng nhập bằng Face ID?" hiện một lần trên thiết bị có WebAuthn, khi tài khoản chưa có passkey nào.
 * Chọn "Để sau" hoặc bật xong thì nhớ trong localStorage theo từng người dùng (không hỏi lại trên thiết bị này);
 * muốn bật sau vẫn có mục Face ID trong Cài đặt. Không hiện ngay trong Cài đặt vì mục đó nằm ngay đó.
 */
export function PasskeyPrompt({ userId }: { userId: string }) {
  const path = usePathname()
  const [stale, setStale] = useState(false)
  const inSettings = path === '/cai-dat'
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!webAuthnSupported() || passkeyPromptDismissed(userId)) return
    let cancelled = false
    void authClient.passkey
      .listUserPasskeys()
      .then((res) => {
        // chỉ hỏi khi chắc chắn là chưa có passkey (lỗi mạng/phiên thì thôi, không làm phiền)
        if (!cancelled && !res.error && (res.data ?? []).length === 0) setOpen(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

  async function onEnable() {
    setBusy(true)
    setError(null)
    try {
      const res = await authClient.passkey.addPasskey({ name: passkeyDeviceName(navigator.userAgent) })
      if (res.error) {
        if (classifyAddPasskeyError(res.error) === 'session-not-fresh') setStale(true)
        else setError('Chưa bật được Face ID. Bạn có thể thử lại hoặc bật sau trong Cài đặt')
        return
      }
      dismissPasskeyPrompt(userId)
      setOpen(false)
    } catch {
      setError('Chưa bật được Face ID. Bạn có thể thử lại hoặc bật sau trong Cài đặt')
    } finally {
      setBusy(false)
    }
  }

  async function onRelogin() {
    setBusy(true)
    try {
      await signOutClient()
    } finally {
      // điều hướng cứng: router.refresh() của trang cũ sẽ bị guard chuyển về /login mất tham số next
      window.location.assign(RELOGIN_FOR_PASSKEY_HREF)
    }
  }

  function onLater() {
    dismissPasskeyPrompt(userId)
    setOpen(false)
  }

  if (!open || inSettings) return null
  return (
    <ConfirmSheet
      tone="primary"
      title="Bật đăng nhập bằng Face ID?"
      body={
        stale
          ? SESSION_NOT_FRESH_MESSAGE
          : 'Lần sau chỉ cần nhìn vào iPhone là vào được app. Mật khẩu vẫn dùng được như cũ, và bạn tắt Face ID bất cứ lúc nào trong Cài đặt.'
      }
      confirmLabel={stale ? 'Đăng xuất' : 'Bật Face ID'}
      cancelLabel="Để sau"
      pending={busy}
      error={error}
      onConfirm={stale ? onRelogin : onEnable}
      onCancel={onLater}
    />
  )
}
