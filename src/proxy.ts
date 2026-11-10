import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { routeGuard } from '@/lib/route-guard'

/**
 * Lớp ngoài, chạy ở edge nên chỉ biết "có cookie phiên hay không":
 * chưa có cookie thì chuyển về /login (giữ `next` cho link mời); còn lại cho qua và gắn
 * `x-pathname` để layout phía server áp routeGuard đầy đủ (đổi mật khẩu, quyền admin).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (!getSessionCookie(request)) {
    const decision = routeGuard({ loggedIn: false, mustChangePassword: false, role: 'user' }, path)
    if (decision) return NextResponse.redirect(new URL(decision.redirect, request.url))
  }
  const headers = new Headers(request.headers)
  headers.set('x-pathname', path)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // bỏ qua tài nguyên build của Next; tệp tĩnh trong public/ vẫn qua proxy nhưng routeGuard luôn cho đi
  matcher: ['/((?!_next/static|_next/image).*)'],
}
