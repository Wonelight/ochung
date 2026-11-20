import Link from 'next/link'
import type { PayslipTab } from '@/lib/payslip-view'

// Hai tab của màn phiếu, kiểu ô chọn của bộ lọc màn Hóa đơn (khung surface bo 16, ô đang chọn nền inner viền trong line2,
// cao 40). Là link (`?tab=house`) chứ không phải trạng thái phía máy: mở lại link, nút Back và thông báo đều về đúng tab.
export function PayslipTabs({ active, items }: { active: PayslipTab; items: { tab: PayslipTab; label: string; href: string }[] }) {
  return (
    <nav aria-label="Xem phiếu" className="flex gap-1 rounded-[16px] border border-line bg-surface p-1">
      {items.map((it) => {
        const on = it.tab === active
        return (
          <Link
            key={it.tab}
            href={it.href}
            replace
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={`flex h-10 min-w-0 flex-1 items-center justify-center truncate rounded-[12px] px-2 text-[14px] font-semibold no-underline ${
              on ? 'bg-inner text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'text-muted'
            }`}
          >
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
