'use client'

import { useCallback, useEffect, useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { authClient } from '@/lib/auth-client'
import {
  RELOGIN_FOR_PASSKEY_HREF,
  SESSION_NOT_FRESH_MESSAGE,
  classifyAddPasskeyError,
  dismissPasskeyPrompt,
  passkeyDeviceName,
  webAuthnSupported,
} from '@/lib/passkey-client'
import { signOutClient } from '@/lib/sign-out'
import { ErrorText, ghostButtonClass, secondaryButtonClass } from '../../nha/_ui/settings-parts'

type PasskeyRow = { id: string; name: string; createdAt: Date | null }

const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })

/** Face ID (passkey): thêm khóa cho thiết bị đang dùng, xem danh sách khóa đã thêm và xóa từng khóa. Mật khẩu vẫn dùng được song song. */
export function PasskeyManager({ userId }: { userId: string }) {
  const [stale, setStale] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [list, setList] = useState<PasskeyRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<PasskeyRow | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await authClient.passkey.listUserPasskeys()
      if (res.error) throw new Error(res.error.message)
      setList(
        (res.data ?? []).map((p) => ({ id: p.id, name: p.name?.trim() || 'Face ID', createdAt: p.createdAt ? new Date(p.createdAt) : null })),
      )
    } catch {
      setList([])
      setError('Không tải được danh sách Face ID')
    }
  }, [])

  useEffect(() => {
    // WebAuthn là API của trình duyệt nên chỉ biết được sau khi mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(webAuthnSupported())
    void load()
  }, [load])

  async function onAdd() {
    if (busy) return
    setBusy(true)
    setError('')
    setStale(false)
    try {
      const res = await authClient.passkey.addPasskey({ name: passkeyDeviceName(navigator.userAgent) })
      if (res.error) {
        const failure = classifyAddPasskeyError(res.error)
        if (failure === 'session-not-fresh') setStale(true)
        else setError(failure === 'already-registered' ? 'Thiết bị này đã có Face ID cho tài khoản của bạn' : 'Chưa bật được Face ID. Hãy thử lại')
        return
      }
      dismissPasskeyPrompt(userId) // đã bật rồi thì không cần hỏi lại
      await load()
    } catch {
      setError('Chưa bật được Face ID. Hãy thử lại')
    } finally {
      setBusy(false)
    }
  }

  async function onRelogin() {
    setBusy(true)
    try {
      await signOutClient() // gỡ thông báo đẩy của thiết bị trước, rồi hủy phiên
    } finally {
      // điều hướng cứng: router.refresh() của trang cũ sẽ bị guard chuyển về /login mất tham số next
      window.location.assign(RELOGIN_FOR_PASSKEY_HREF)
    }
  }

  async function onRemove() {
    if (!removing || busy) return
    setBusy(true)
    setRemoveError(null)
    try {
      const res = await authClient.passkey.deletePasskey({ id: removing.id })
      if (res.error) {
        setRemoveError('Không xóa được. Hãy thử lại')
        return
      }
      setRemoving(null)
      await load()
    } catch {
      setRemoveError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Face ID" className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[17px] font-semibold">Face ID</h2>
        <p className="m-0 text-[13px] leading-snug text-muted">
          {supported === false
            ? 'Thiết bị hoặc trình duyệt này chưa hỗ trợ đăng nhập bằng Face ID.'
            : 'Đăng nhập nhanh bằng khuôn mặt hoặc vân tay. Mật khẩu vẫn dùng được song song.'}
        </p>
      </div>

      {list && list.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {list.map((p) => (
            <li key={p.id} className="flex min-h-[52px] items-center gap-3 border-t border-line first:border-t-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{p.name}</span>
                {p.createdAt && <span className="text-[12px] text-muted">Thêm ngày {dateFormat.format(p.createdAt)}</span>}
              </div>
              <button type="button" onClick={() => setRemoving(p)} className={`${ghostButtonClass} text-unpaid-fg`}>
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported && (
        <button type="button" onClick={onAdd} disabled={busy} className={secondaryButtonClass}>
          {busy && !removing ? 'Đang chờ xác nhận…' : list && list.length > 0 ? 'Thêm Face ID cho thiết bị này' : 'Bật Face ID'}
        </button>
      )}
      <ErrorText>{error}</ErrorText>
      {stale && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
            {SESSION_NOT_FRESH_MESSAGE}
          </p>
          <button type="button" onClick={onRelogin} disabled={busy} className={secondaryButtonClass}>
            Đăng xuất để đăng nhập lại
          </button>
        </div>
      )}

      {removing && (
        <ConfirmSheet
          title="Xóa Face ID này?"
          body={`Khóa "${removing.name}" sẽ bị xóa; thiết bị đó không đăng nhập bằng Face ID được nữa. Bạn vẫn đăng nhập bằng mật khẩu.`}
          confirmLabel="Xóa"
          pending={busy}
          error={removeError}
          onConfirm={onRemove}
          onCancel={() => {
            setRemoving(null)
            setRemoveError(null)
          }}
        />
      )}
    </section>
  )
}
