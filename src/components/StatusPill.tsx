import type { PillTone } from '@/lib/payments-view'

// Nhãn trạng thái, chép từ mockup `Trang chủ — tháng 11` (5px 10px, bo 999, 12px đậm 600, icon 12px):
// Đã trả có dấu tích, Chờ xác nhận có đồng hồ, Chưa trả không icon. Thêm hai kiểu không có trong mockup:
// `neutral` (Chủ nhà, Chốt sổ: nền inner + viền line2 như nhãn "Chốt số" của mockup Biểu phí) và `draft` (tháng nháp).
const TONE: Record<PillTone | 'neutral' | 'draft', string> = {
  paid: 'bg-paid-bg text-paid-fg',
  pending: 'bg-pend-bg text-pend-fg',
  unpaid: 'bg-unpaid-bg text-unpaid-fg',
  neutral: 'border border-line2 bg-inner text-text',
  draft: 'border border-[rgba(232,131,58,0.45)] bg-[rgba(232,131,58,0.12)] text-accent-text',
}

export function StatusPill({
  tone,
  text,
  compact = false,
  className = '',
}: {
  tone: PillTone | 'neutral' | 'draft'
  text: string
  /** Kích thước của màn Hóa đơn: 4px 9px. */
  compact?: boolean
  className?: string
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full text-[12px] font-semibold ${
        compact ? 'px-[9px] py-1' : 'px-2.5 py-[5px]'
      } ${TONE[tone]} ${className}`}
    >
      {tone === 'paid' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      {tone === 'pending' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )}
      {text}
    </span>
  )
}
