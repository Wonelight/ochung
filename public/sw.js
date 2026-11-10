// Service worker của Chi tiêu nhà.
//
// Lưu sẵn (cache-first) CHỈ tài nguyên tĩnh bất biến để app mở nhanh: JS/CSS/font đã băm tên trong /_next/static/ và icon.
// KHÔNG BAO GIỜ lưu HTML, dữ liệu RSC, /api/* hay mọi phản hồi khác: những thứ đó chứa số tiền và trạng thái thanh toán,
// lưu lại sẽ hiện số cũ (spec: không hiện số tiền hay trạng thái cũ). Khi mất mạng, trang chỉ hiện một thông báo "Không có kết nối".
// Xử lý `push` (hiện thông báo) và `notificationclick` (mở/focus app tại data.url).

const CACHE = 'chi-tieu-nha-static-v1'
// Bản dev (đăng ký bằng /sw.js?dev=1): tệp /_next/static không băm tên nên không được lưu.
const IS_DEV = new URL(self.location.href).searchParams.has('dev')

const ICON = '/icons/icon-192.png'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

function isCacheableStatic(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

const OFFLINE_HTML =
  '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Chi tiêu nhà</title>' +
  '<style>body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#0E0B08;color:#F1E6D2;font:16px/1.5 -apple-system,system-ui,sans-serif;text-align:center;padding:24px}' +
  'button{margin-top:16px;height:44px;padding:0 24px;border:0;border-radius:22px;background:#E8833A;color:#1A0F06;font:700 15px system-ui}</style></head>' +
  '<body><div><p style="font-size:17px;font-weight:600;margin:0">Không có kết nối mạng</p>' +
  '<p style="color:#B3A58E;margin:8px 0 0">Kiểm tra mạng rồi thử lại. Số liệu luôn được tải mới, không lưu sẵn trên máy.</p>' +
  '<button onclick="location.reload()">Thử lại</button></div></body></html>'

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // luôn lấy từ mạng; chỉ khi mất mạng mới có trang báo lỗi (không chứa dữ liệu)
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    )
    return
  }

  // mọi thứ khác (RSC, API, dữ liệu) để trình duyệt xử lý bình thường, không đi qua cache
  if (IS_DEV || !isCacheableStatic(url)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok && res.type === 'basic') await cache.put(req, res.clone())
      return res
    })(),
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Chi tiêu nhà'
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/'
  // iOS bắt buộc mỗi push phải hiện một thông báo (userVisibleOnly)
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: ICON,
      badge: ICON,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = event.notification.data && event.notification.data.url
  const path = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
