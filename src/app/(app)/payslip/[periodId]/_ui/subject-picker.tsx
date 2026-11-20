'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Avatar } from '@/components/Avatar'

// Chủ nhà chọn người để xem phiếu. Không có mockup: hàng chip cuộn ngang cao 44px; chip đang chọn nền inner, viền cam
// trong 1.5px (như ô đang chọn của DESIGN.md), chip khác nền surface viền line. Mở từ Trang chủ bằng ?member= của người
// đứng sau thì chip đó có thể nằm ngoài màn, nên hàng tự cuộn để chip đang chọn ra giữa.
export function SubjectPicker({ periodId, selectedId, people }: { periodId: string; selectedId: string; people: { id: string; name: string; seed: string }[] }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selectedId])

  return (
    <nav ref={ref} aria-label="Xem phiếu của" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none]">
      {people.map((p) => {
        const on = p.id === selectedId
        return (
          <Link
            key={p.id}
            href={`/payslip/${periodId}?member=${p.id}`}
            replace
            scroll={false}
            aria-current={on ? 'page' : undefined}
            aria-label={`Phiếu của ${p.name}`}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-[22px] pl-1.5 pr-3.5 text-[14px] font-semibold no-underline ${
              on ? 'bg-inner text-text shadow-[inset_0_0_0_1.5px_var(--c-accent-line)]' : 'border border-line bg-surface text-muted'
            }`}
          >
            <Avatar seed={p.seed} size={32} />
            {p.name}
          </Link>
        )
      })}
    </nav>
  )
}
