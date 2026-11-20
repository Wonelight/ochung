'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Avatar } from '@/components/Avatar'

// Hàng chip chọn phiếu để xem, cao 44px, cuộn ngang trong đúng cột nội dung (thẳng mép với đường kẻ đầu trang và các thẻ,
// không tràn ra lề). Chip đầu luôn là "Nhà" (thẻ tháng của cả nhà), sau đó là từng người
// (chủ nhà thấy cả nhà, thành viên chỉ thấy mình). Chip đang chọn nền inner, viền cam trong 1.5px (ô đang chọn của
// DESIGN.md); chip khác nền surface viền line. Mở bằng ?member= của người đứng sau thì chip đó có thể nằm ngoài màn, nên
// hàng tự cuộn ngang để chip đang chọn ra giữa (chỉ cuộn hàng chip, không cuộn trang).
export type PickerChip = { key: string; label: string; ariaLabel: string; href: string; seed: string | null; on: boolean }

const chipBase = 'flex h-11 shrink-0 items-center gap-2 rounded-[22px] pl-1.5 pr-3.5 text-[14px] font-semibold no-underline'
const chipOn = 'bg-inner text-text shadow-[inset_0_0_0_1.5px_var(--c-accent-line)]'
const chipOff = 'border border-line bg-surface text-muted'

function HouseIcon() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-deep text-accent-text">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    </span>
  )
}

export function SubjectPicker({ chips }: { chips: PickerChip[] }) {
  const ref = useRef<HTMLElement>(null)
  const selected = chips.find((c) => c.on)?.key
  useEffect(() => {
    const nav = ref.current
    const chip = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !chip) return
    const offset = chip.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft
    nav.scrollTo({ left: offset - (nav.clientWidth - chip.offsetWidth) / 2 })
  }, [selected])

  return (
    <nav ref={ref} aria-label="Xem phiếu" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          replace
          scroll={false}
          aria-current={c.on ? 'page' : undefined}
          aria-label={c.ariaLabel}
          className={`${chipBase} ${c.on ? chipOn : chipOff}`}
        >
          {c.seed === null ? <HouseIcon /> : <Avatar seed={c.seed} size={32} decorative />}
          {c.label}
        </Link>
      ))}
    </nav>
  )
}
