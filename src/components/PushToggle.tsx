'use client'

import { useEffect, useState } from 'react'
import { ErrorText, Switch } from '@/app/(app)/nha/_ui/settings-parts'
import { canSubscribePush, urlBase64ToBytes } from '@/lib/pwa-env'

type State = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on'

const API = '/api/push/subscribe'
const json = { 'Content-Type': 'application/json' }

/**
 * Công tắc thông báo đẩy (đặt trong Cài đặt). Đăng ký chỉ chạy từ lần bấm của người dùng (iOS bắt buộc phải có cử chỉ)
 * và chỉ khi trình duyệt có PushManager; trên iPhone điều đó chỉ đúng khi app đã thêm vào Màn hình chính.
 */
export function PushToggle() {
  const [state, setState] = useState<State>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let next: State = 'unsupported'
      if (canSubscribePush()) {
        try {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          next = sub && Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off'
        } catch {
          next = 'off'
        }
      }
      if (!cancelled) setState(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    const permission = await Notification.requestPermission() // phải gọi ngay trong lần bấm, trước mọi await khác
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'blocked' : 'off')
      return
    }
    const keyRes = await fetch(API)
    const { publicKey } = (await keyRes.json().catch(() => ({}))) as { publicKey?: string | null }
    if (!keyRes.ok || !publicKey) throw new Error('Máy chủ chưa bật thông báo đẩy')
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) }))
    const res = await fetch(API, { method: 'POST', headers: json, body: JSON.stringify(sub.toJSON()) })
    if (!res.ok) {
      await sub.unsubscribe().catch(() => false)
      const { message } = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(message ?? 'Không bật được thông báo')
    }
    setState('on')
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await fetch(API, { method: 'DELETE', headers: json, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined)
      await sub.unsubscribe()
    }
    setState('off')
  }

  async function onChange(next: boolean) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await (next ? enable() : disable())
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Không đổi được cài đặt thông báo')
    } finally {
      setBusy(false)
    }
  }

  const hint =
    state === 'unsupported'
      ? 'Thêm vào Màn hình chính để nhận thông báo'
      : state === 'blocked'
        ? 'Thông báo đang bị chặn. Bật lại trong Cài đặt của iPhone, mục Thông báo.'
        : 'Nhận thông báo khi chủ nhà chốt sổ, cập nhật phiếu hoặc nhắc đóng tiền.'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[60px] items-center gap-3 rounded-[20px] border border-line bg-surface px-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
          <span className="text-[15px] font-medium">Thông báo đẩy</span>
          <span className="text-[13px] leading-snug text-muted">{hint}</span>
        </div>
        {(state === 'on' || state === 'off') && <Switch checked={state === 'on'} onChange={(v) => void onChange(v)} label="Bật thông báo đẩy" />}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
