import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { routeGuard } from '@/lib/route-guard'

/**
 * Gọi ở đầu layout/trang phía server: đọc phiên, áp `routeGuard` cho đường dẫn hiện tại
 * (proxy gắn vào header `x-pathname`) và chuyển hướng nếu không được vào.
 * Trả về user của phiên (hoặc null khi ở trang công khai như /login).
 */
export async function guardRoute() {
  const h = await headers()
  const path = h.get('x-pathname') ?? '/'
  const session = await auth.api.getSession({ headers: h })
  const user = session?.user ?? null
  const decision = routeGuard(
    {
      loggedIn: user !== null,
      mustChangePassword: user?.mustChangePassword === true,
      role: user?.role === 'admin' ? 'admin' : 'user',
    },
    path,
  )
  if (decision) redirect(decision.redirect)
  return user
}
