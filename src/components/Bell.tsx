import Link from 'next/link'

/** Chuông ở đầu Trang chủ (mockup `Trang chủ`): nút tròn 44px, chấm cam 8px góc trên phải khi có thông báo chưa đọc. */
export function Bell({ unread }: { unread: number }) {
  return (
    <Link
      href="/thong-bao"
      aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-[22px] border border-line bg-surface p-0 text-text"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-[11px] top-2.5 size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--c-surface)]" />
      )}
    </Link>
  )
}
