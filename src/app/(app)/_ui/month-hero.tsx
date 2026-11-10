import type { ReactNode } from 'react'

// Khung thẻ tháng của Trang chủ, chép từ mockup: nền card, viền line, bo 28, đệm 18, khoảng cách 18,
// hình trang trí (mặt trời, trăng, hai dải đồi) phủ 120px trên cùng.
export function MonthHero({ year, month, children }: { year: number; month: number; children: ReactNode }) {
  return (
    <section
      aria-label={`Tháng ${month} năm ${year}`}
      className="relative flex flex-col gap-[18px] overflow-hidden rounded-[28px] border border-line bg-card p-[18px] text-text"
    >
      <svg width="100%" height="120" viewBox="0 0 350 120" preserveAspectRatio="none" aria-hidden="true" className="absolute left-0 top-0 block">
        <circle cx="236" cy="70" r="34" fill="#E8833A" style={{ fillOpacity: 'var(--c-sun-op)' }} />
        <circle cx="236" cy="70" r="20" fill="#E8833A" style={{ fillOpacity: 'var(--c-sun-op)' }} />
        <circle cx="292" cy="28" r="5" fillOpacity="0.45" style={{ fill: 'var(--c-moon)' }} />
        <path d="M0 86 Q80 58 168 80 T350 66 V120 H0Z" style={{ fill: 'var(--c-ridge)' }} />
        <path d="M0 104 Q130 78 236 100 T350 92 V120 H0Z" style={{ fill: 'var(--c-card)' }} />
      </svg>
      {children}
    </section>
  )
}

/** Thanh tiến độ thu tiền (cao 6, bo 3, màu nhấn có quầng) + hai nhãn dưới thanh. */
export function CollectProgress({ ratio, left, right }: { ratio: number; left: ReactNode; right: ReactNode }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`
  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-track">
        <div className="h-1.5 rounded-[3px] bg-accent shadow-[0_0_10px_var(--c-glow)]" style={{ width: pct }} />
      </div>
      <div className="flex justify-between gap-3 text-[13px]">
        <span>{left}</span>
        <span className="text-muted">{right}</span>
      </div>
    </div>
  )
}

export const primaryLinkClass =
  'flex h-11 items-center justify-center rounded-[22px] border-0 bg-accent px-5 text-[14px] font-bold text-[#1A0F06] no-underline disabled:opacity-50'
export const secondaryLinkClass =
  'flex h-11 items-center justify-center rounded-[22px] border border-line2 bg-raised px-5 text-[14px] font-semibold text-text no-underline'
