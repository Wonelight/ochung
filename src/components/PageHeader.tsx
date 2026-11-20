import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Đầu trang con: nút quay lại 44px, tiêu đề giữa, bên phải là `action` (ví dụ nút "Sửa") hoặc ô trống đối xứng (chép từ
 * mockup `Quản lý nhà`). Đáy có đường kẻ phân tách đầu trang với nội dung, tràn hết chiều ngang màn: mọi trang dùng nó đều
 * có lề ngang 20px (`px-5`), nên `-mx-5 px-5` đưa đường kẻ ra tới mép.
 */
export function PageHeader({ title, backHref, action }: { title: ReactNode; backHref?: string; action?: ReactNode }) {
  return (
    <header className="-mx-5 flex items-center gap-2 border-b border-line px-5 pb-3">
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
      {action ?? <span className="w-11 shrink-0" />}
    </header>
  )
}
