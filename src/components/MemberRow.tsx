import Link from 'next/link'
import type { ReactNode } from 'react'
import { Avatar } from './Avatar'

/**
 * Một người trong danh sách thanh toán. `home`: hàng của Trang chủ (avatar 36, cao tối thiểu 60, nhãn trạng thái ở
 * bên phải). `bills`: hàng của màn Hóa đơn (avatar 40, đệm 14px, nhãn trạng thái dưới ghi chú). Chép từ hai mockup đó.
 */
export function MemberRow({
  name,
  avatarSeed,
  note,
  variant,
  last,
  below,
  aside,
  href,
}: {
  name: string
  /** Hạt giống ảnh đại diện; thiếu thì dùng `name`. */
  avatarSeed?: string
  note?: ReactNode
  variant: 'home' | 'bills'
  last: boolean
  /** Dưới ghi chú (nhãn trạng thái của màn Hóa đơn). */
  below?: ReactNode
  /** Cột phải: số tiền, nhãn, nút. */
  aside?: ReactNode
  /** Có thì cả hàng là một liên kết (mở phiếu chi tiết của người đó) và hiện mũi tên ở cuối. */
  href?: string
}) {
  const home = variant === 'home'
  const cls = `flex items-center gap-3 ${home ? 'min-h-[60px]' : 'py-3.5'} ${last ? '' : 'border-b border-line'}`
  const body = (
    <>
      <Avatar seed={avatarSeed ?? name} size={home ? 36 : 40} decorative />
      <div className={`flex min-w-0 flex-1 flex-col ${home ? '' : 'gap-0.5'}`}>
        <span className="truncate text-[15px] font-semibold">{name}</span>
        {note && <span className="text-[12px] text-muted">{note}</span>}
        {below}
      </div>
      {aside}
      {href && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-faint">
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </>
  )
  if (!href) return <div className={cls}>{body}</div>
  return (
    // tên link lấy từ nội dung hàng (tên, ghi chú, số tiền, trạng thái) để trình đọc màn hình đọc đủ
    <Link href={href} className={`${cls} text-text no-underline transition-transform active:scale-[.97]`}>
      {body}
    </Link>
  )
}
