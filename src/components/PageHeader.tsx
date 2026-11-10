import Link from 'next/link'

/** Đầu trang con: nút quay lại 44px, tiêu đề giữa, ô trống đối xứng (chép từ mockup `Quản lý nhà`). */
export function PageHeader({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <header className="flex items-center gap-2">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Quay lại"
          className="flex size-11 shrink-0 items-center justify-center rounded-[22px] border border-line bg-surface text-text"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      ) : (
        <span className="w-11 shrink-0" />
      )}
      <h1 className="m-0 flex-1 text-center text-[17px] font-semibold">{title}</h1>
      <span className="w-11 shrink-0" />
    </header>
  )
}
