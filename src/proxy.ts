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
  // Tệp tĩnh trong public/ (có đuôi tệp) không cần đăng nhập. Chỉ miễn ở đây: layout vẫn áp routeGuard
  // đầy đủ, nên /admin/x.json hay /moi/abc.def không lọt qua nhờ đuôi tệp.
  const isStaticFile = /\.[a-z0-9]+$/i.test(path) && !path.startsWith('/admin') && !path.startsWith('/moi')
  if (!isStaticFile && !getSessionCookie(request)) {
    const decision = routeGuard({ loggedIn: false, mustChangePassword: false, role: 'user' }, path)
    if (decision) return NextResponse.redirect(new URL(decision.redirect, request.url))
  }
  const headers = new Headers(request.headers)
  headers.set('x-pathname', path)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // bỏ qua tài nguyên build của Next; tệp tĩnh trong public/ vẫn qua proxy và được miễn ở hàm proxy bên trên
  matcher: ['/((?!_next/static|_next/image).*)'],
}
