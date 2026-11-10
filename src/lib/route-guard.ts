export type GuardState = {
  loggedIn: boolean
  mustChangePassword: boolean
  role: 'admin' | 'user'
}

const LOGIN = '/login'
const CHANGE_PASSWORD = '/doi-mat-khau'

/** Tệp tĩnh (có đuôi tệp) và nội bộ Next luôn đi qua; `/api/auth/*` là cổng đăng nhập của Better Auth. */
function isAlwaysOpen(path: string): boolean {
  return path.startsWith('/api/auth/') || path.startsWith('/_next/') || /\.[a-z0-9]+$/i.test(path)
}

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Quyết định chuyển hướng cho một đường dẫn theo trạng thái phiên (thuần, không đụng request).
 * Trả `null` nếu được vào. Dùng ở layout phía server; proxy chỉ dùng nhánh "chưa đăng nhập".
 */
export function routeGuard(s: GuardState, path: string): { redirect: string } | null {
  if (isAlwaysOpen(path)) return null

  if (!s.loggedIn) {
    if (path === LOGIN) return null
    // Link mời vào nhà: đăng nhập xong quay lại đúng link.
    if (isUnder(path, '/moi')) return { redirect: `${LOGIN}?next=${encodeURIComponent(path)}` }
    return { redirect: LOGIN }
  }

  if (s.mustChangePassword) {
    return path === CHANGE_PASSWORD ? null : { redirect: CHANGE_PASSWORD }
  }

  if (path === LOGIN || path === CHANGE_PASSWORD) return { redirect: '/' }
  if (isUnder(path, '/admin') && s.role !== 'admin') return { redirect: '/' }
  return null
}

/** Chỉ nhận đường dẫn tương đối cùng gốc cho tham số `next`; mọi thứ khác về `/`. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (/[\u0000-\u001f\u007f]/.test(next)) return '/'
  if (next === LOGIN || next.startsWith(`${LOGIN}?`) || next.startsWith(`${LOGIN}/`)) return '/'
  return next
}
