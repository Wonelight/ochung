import type { Metadata } from 'next'
import { AuthHero } from '@/app/(auth)/_ui/auth-hero'
import { guardRoute } from '@/server/guard'
import { AcceptInvite } from './accept-invite'

export const metadata: Metadata = { title: 'Lời mời vào nhà — Chi tiêu nhà' }

// Nằm ngoài nhóm (app) nên tự chạy guard: chưa đăng nhập → /login?next=/moi/<token>, đăng nhập xong quay lại đây.
// Việc vào nhà làm ở client sau khi trang tải (không làm khi render, để bot xem trước link không vô tình dùng link).
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await guardRoute()
  const { token } = await params
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg text-text">
      <AuthHero subtitle="Lời mời vào nhà" />
      <AcceptInvite token={token} />
    </main>
  )
}
