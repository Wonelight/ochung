import Link from 'next/link'

// Đầu thẻ tháng của Trang chủ, chép từ mockup: số tháng Lexend 56px, "Tháng" + năm, hai nút mũi tên 44px.
// Mũi tên dẫn tới tháng liền kề trong danh sách tháng người xem thấy được; hết tháng thì nút bị tắt như mockup.

const arrowOn = 'flex size-11 items-center justify-center rounded-[22px] border border-line2 bg-raised p-0 text-text'
const arrowOff = 'flex size-11 items-center justify-center rounded-[22px] border border-line bg-card p-0 text-disabled'

function Arrow({ href, label, d }: { href: string | null; label: string; d: string }) {
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
  if (!href) {
    return (
      <button type="button" aria-label={label} disabled className={arrowOff}>
        {icon}
      </button>
    )
  }
  return (
    <Link href={href} aria-label={label} className={arrowOn}>
      {icon}
    </Link>
  )
}

export function MonthHeader({
  year,
  month,
  olderHref,
  newerHref,
}: {
  year: number
  month: number
  olderHref: string | null
  newerHref: string | null
}) {
  return (
    <div className="relative flex items-end justify-between">
      <div className="flex items-end gap-2.5">
        <span className="font-numeric text-[56px] font-semibold leading-[0.86] tracking-[-0.04em]">{month}</span>
        <div className="flex flex-col pb-0.5">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted">Tháng</span>
          <span className="text-[15px] font-semibold">{year}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Arrow href={olderHref} label="Tháng trước" d="m15 18-6-6 6-6" />
        <Arrow href={newerHref} label="Tháng sau" d="m9 18 6-6-6-6" />
      </div>
    </div>
  )
}
