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
}) {
  const home = variant === 'home'
  return (
    <div className={`flex items-center gap-3 ${home ? 'min-h-[60px]' : 'py-3.5'} ${last ? '' : 'border-b border-line'}`}>
      <Avatar seed={avatarSeed ?? name} size={home ? 36 : 40} />
      <div className={`flex min-w-0 flex-1 flex-col ${home ? '' : 'gap-0.5'}`}>
        <span className="truncate text-[15px] font-semibold">{name}</span>
        {note && <span className="text-[12px] text-muted">{note}</span>}
        {below}
      </div>
      {aside}
    </div>
  )
}
