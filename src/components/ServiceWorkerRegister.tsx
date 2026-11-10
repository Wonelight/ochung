'use client'

import { useEffect } from 'react'

/** Đăng ký service worker (public/sw.js) một lần khi app mở. Bản dev gắn ?dev=1 để sw.js không lưu tệp không băm tên. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const url = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?dev=1'
    navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' }).catch((e) => {
      console.error('Không đăng ký được service worker', e)
    })
  }, [])
  return null
}
