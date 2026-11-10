import Link from 'next/link'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { timeAgoVi } from '@/lib/time-ago'
import { getHouseContext } from '@/server/current-house'
import { listNotifications } from '@/server/notifications'
import { ComposeMessage } from './_ui/compose-message'
import { MarkAllRead } from './_ui/mark-all-read'

export const metadata = { title: 'Thông báo' }

// Trang chuông (không có mockup): khung và thẻ danh sách dùng lại của Hóa đơn / Quản lý nhà (thẻ bo 20, hàng cao tối thiểu
// 56 có đường kẻ line, chấm cam 8px như chấm của chuông ở Trang chủ). Mở trang là đánh dấu đã đọc hết; hàng chưa đọc
// vẫn hiện nổi bật trong lần mở này. Chủ nhà thấy thêm khối soạn tin gửi cả nhà.
export default async function NotificationsPage() {
  const { actor, current } = await getHouseContext()
  const now = new Date()
  const items = await listNotifications(db, actor)
  const canCompose = current !== null && current.role === 'owner' && !current.archived

  return (
    <main className="flex flex-col gap-[18px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <PageHeader title="Thông báo" backHref="/" />
      <MarkAllRead hasUnread={items.some((n) => n.readAt === null)} />

      {canCompose && <ComposeMessage houseId={current.houseId} />}

      {items.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">Chưa có thông báo nào.</p>
      ) : (
        <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
          {items.map((n, i) => (
            <Link
              key={n.id}
              href={n.url}
              className={`flex min-h-14 items-start gap-3 py-3 text-text no-underline ${i < items.length - 1 ? 'border-b border-line' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`mt-[7px] size-2 shrink-0 rounded-full ${n.readAt === null ? 'bg-accent' : 'bg-transparent'}`}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-[15px] leading-snug ${n.readAt === null ? 'font-semibold' : 'font-medium'}`}>{n.title}</span>
                <span className="text-[13px] leading-snug text-muted">{n.body}</span>
                <span className="text-[12px] text-faint">{timeAgoVi(n.createdAt, now)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
