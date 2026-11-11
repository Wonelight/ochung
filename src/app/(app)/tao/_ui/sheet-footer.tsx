'use client'

import { formatVnd } from '@/lib/money'

// Chân trang Tạo hóa đơn (dính đáy màn hình): gọn để phần nhập liệu ở trên có nhiều chỗ. Một hàng duy nhất: bên trái nhãn + tổng (Lexend 19) và dòng
// "Phần của bạn" nhỏ dưới tổng; bên phải nút chính cao 48 bo 24 màu #E8833A có bóng. Lỗi (đỏ) / lời nhắc (chữ nhạt) là một dòng
// 12px tối đa 2 dòng nằm ngay trên hàng đó. Thẻ nổi bo 24, viền line, nền panel và bóng như các thẻ khác của app, đặt trên lớp mờ dần để nội dung cuộn phía sau không bị cắt cứng.
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
    <div className="sticky bottom-0 z-10 shrink-0 bg-[linear-gradient(to_bottom,var(--c-fade0),var(--c-bg)_45%)] px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-6">
      <div className="flex flex-col gap-2 rounded-[24px] border border-line bg-[var(--c-create-panel)] p-3 shadow-[0_10px_24px_var(--c-bar-shadow)]">
        {message ? (
          <p role="alert" className="m-0 line-clamp-2 text-[12px] font-medium leading-snug text-unpaid-fg">
            {message}
          </p>
        ) : (
          hint && <p className="m-0 line-clamp-2 text-[12px] leading-snug text-muted">{hint}</p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12px] leading-tight text-muted">{label}</span>
            <span className="truncate font-numeric text-[19px] font-semibold leading-tight tracking-[-0.04em] tabular-nums">
              {total === null ? '—' : `${formatVnd(total)} đ`}
            </span>
            {rightLabel && rightValue !== null && (
              <span className="truncate text-[12px] leading-tight text-muted">
                {rightLabel} <span className="font-numeric font-semibold tracking-[-0.03em] text-accent-text tabular-nums">{formatVnd(rightValue)} đ</span>
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={onCta}
            className="flex h-12 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-[24px] border-0 bg-accent px-5 font-[inherit] text-[15px] font-bold text-[#1A0F06] shadow-[0_6px_18px_rgba(232,131,58,0.28)] disabled:cursor-default disabled:opacity-50"
          >
            {busy ? 'Đang lưu…' : cta}
          </button>
        </div>
      </div>
    </div>
  )
}
