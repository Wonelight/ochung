import Link from 'next/link'
import { CategoryIcon, itemIconKind, type CategoryKind } from '@/components/CategoryIcon'
import type { HomeTile } from '@/lib/home-tiles'
import { formatVnd } from '@/lib/money'

// Lưới ô của thẻ tháng (mockup `Trang chủ — tháng 11`): ô vuông nền inner bo 18 đệm 14, hàng rộng như "Tiền nhà".
// Mỗi ô dẫn tới phiếu của tháng (mockup: Biểu phí tháng).

function iconOf(t: HomeTile): CategoryKind {
  const s = t.source
  if (s.type === 'item') return itemIconKind(s.name, s.kind)
  if (s.type === 'electricity') return 'elec'
  if (s.type === 'water') return 'water'
  return 'receipt'
}

const amountClass = 'font-numeric text-[15px] font-semibold tracking-[-0.03em] tabular-nums'

export function MonthTiles({ tiles, href }: { tiles: HomeTile[]; href: string }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map((t) =>
        t.wide ? (
          <Link key={t.key} href={href} className="col-span-2 flex items-center gap-3 rounded-[18px] bg-inner p-3.5 text-text no-underline">
            <CategoryIcon kind={iconOf(t)} />
            <span className="min-w-0 flex-1 truncate text-[14px] text-muted">
              {t.label}
              {t.source.type === 'expenses' ? ` · ${t.note}` : ''}
            </span>
            <span className={amountClass}>{t.amount === null ? '—' : `${formatVnd(t.amount)} đ`}</span>
          </Link>
        ) : (
          <Link key={t.key} href={href} className="flex min-w-0 flex-col gap-3 rounded-[18px] bg-inner p-3.5 text-text no-underline">
            <div className="flex items-center justify-between gap-2">
              <CategoryIcon kind={iconOf(t)} />
              <span className="truncate text-[12px] text-muted">{t.note}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] text-muted">{t.label}</span>
              <span className={amountClass}>{t.amount === null ? '—' : `${formatVnd(t.amount)} đ`}</span>
            </div>
          </Link>
        ),
      )}
    </div>
  )
}
