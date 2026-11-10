'use client'

import { formatVnd } from '@/lib/money'

// Chân tấm Tạo mới, chép từ mockup `Tạo hóa đơn tháng`: nền panel, viền trên, đệm 14/20/34; hàng tổng (Lexend 21)
// và số bên phải màu nhấn (Lexend 15); nút chính cao 54 bo 27 màu #E8833A có bóng. Thêm một dòng lỗi / lời nhắc ngay trên nút.
export function SheetFooter({
  label,
  total,
  rightLabel,
  rightValue,
  message,
  hint,
  cta,
  disabled,
  busy,
  onCta,
}: {
  label: string
  total: number | null
  rightLabel: string | null
  rightValue: number | null
  /** Lỗi (đỏ). */
  message: string | null
  /** Lời nhắc chưa phải lỗi, ví dụ còn thiếu điện/nước trước khi gửi (chữ nhạt). */
  hint?: string | null
  cta: string
  disabled: boolean
  busy?: boolean
  onCta: () => void
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-line bg-[var(--c-create-panel)] px-5 pb-[max(34px,env(safe-area-inset-bottom))] pt-3.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[12px] text-muted">{label}</span>
          <span className="font-numeric text-[21px] font-semibold tracking-[-0.04em] tabular-nums">{total === null ? '—' : `${formatVnd(total)} đ`}</span>
        </div>
        {rightLabel && rightValue !== null && (
          <div className="flex flex-col items-end">
            <span className="text-[12px] text-muted">{rightLabel}</span>
            <span className="font-numeric text-[15px] font-semibold tracking-[-0.03em] text-accent-text tabular-nums">{formatVnd(rightValue)} đ</span>
          </div>
        )}
      </div>
      {message ? (
        <p role="alert" className="m-0 text-[13px] font-medium leading-snug text-unpaid-fg">
          {message}
        </p>
      ) : (
        hint && <p className="m-0 text-[13px] leading-snug text-muted">{hint}</p>
      )}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onCta}
        className="flex h-[54px] cursor-pointer items-center justify-center rounded-[27px] border-0 bg-accent font-[inherit] text-[17px] font-bold text-[#1A0F06] shadow-[0_8px_24px_rgba(232,131,58,0.28)] disabled:cursor-default disabled:opacity-50"
      >
        {busy ? 'Đang lưu…' : cta}
      </button>
    </div>
  )
}
