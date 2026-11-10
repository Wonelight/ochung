import { formatVnd } from '@/lib/money'

/**
 * Số tiền "2.600.000 đ". Có `unitClassName` thì chữ "đ" là span riêng (như số lớn của mockup: "đ" nhỏ, màu nhạt,
 * cách 6px); không thì "đ" đi liền sau dấu cách. Kiểu chữ do người gọi đặt qua `className`.
 */
export function Money({ amount, className, unitClassName }: { amount: number; className?: string; unitClassName?: string }) {
  return (
    <span className={className}>
      {formatVnd(amount)}
      {unitClassName ? <span className={unitClassName}>đ</span> : ' đ'}
    </span>
  )
}
