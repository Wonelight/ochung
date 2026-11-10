import Link from 'next/link'
import { Avatar } from '@/components/Avatar'

// Chủ nhà chọn người để xem phiếu. Không có mockup: hàng chip cuộn ngang, chip đang chọn dùng kiểu ô chọn của bộ lọc
// màn Hóa đơn (nền inner, viền trong line2), chip khác nền surface viền line; cao 44px.
export function SubjectPicker({ periodId, selectedId, people }: { periodId: string; selectedId: string; people: { id: string; name: string }[] }) {
  return (
    <nav aria-label="Xem phiếu của" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none]">
      {people.map((p) => {
        const on = p.id === selectedId
        return (
          <Link
            key={p.id}
            href={`/phieu/${periodId}?tv=${p.id}`}
            replace
            scroll={false}
            aria-current={on ? 'page' : undefined}
            aria-label={`Phiếu của ${p.name}`}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-[22px] pl-1.5 pr-3.5 text-[14px] font-semibold no-underline ${
              on ? 'bg-inner text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'border border-line bg-surface text-muted'
            }`}
          >
            <Avatar seed={p.name} size={32} />
            {p.name}
          </Link>
        )
      })}
    </nav>
  )
}
