'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BillTab } from './bill-tab'
import { ExpenseTab } from './expense-tab'
import type { CreateData } from './types'
import { usePeriodEditor } from './use-period-editor'

// Tấm "Tạo mới" của mockup `Tạo hóa đơn tháng`: phủ cả màn (che thanh dưới), nền backdrop, tấm cách đỉnh 56px bo 28 trên,
// vạch kéo 36×5, tiêu đề 22/700 + nút đóng 44px, ô chọn 2 tab trên nền segBg. Phần giữa cuộn, chân tấm cố định.
export function CreateSheet({ data, initialTab }: { data: CreateData; initialTab: 'bill' | 'expense' }) {
  const [tab, setTab] = useState(initialTab)
  const closed = data.period.status === 'closed'
  const editor = usePeriodEditor({
    periodId: data.period.id,
    snapshot: data.snapshot,
    closed,
    initialPreview: data.initialPreview,
  })

  const tabClass = (on: boolean) =>
    `h-10 cursor-pointer rounded-[12px] border-0 font-[inherit] text-[14px] font-semibold ${
      on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'bg-transparent text-muted'
    }`

  return (
    <div className="fixed inset-0 z-30 flex justify-center bg-[var(--c-create-backdrop)]">
      <div className="relative h-full w-full max-w-[430px] md:max-w-[560px]">
        <div
          role="dialog"
          aria-label={closed ? 'Sửa hóa đơn tháng' : 'Tạo hóa đơn tháng'}
          className="absolute inset-x-0 bottom-0 top-[max(56px,calc(env(safe-area-inset-top)+12px))] flex flex-col overflow-hidden rounded-t-[28px] border-t border-line bg-[var(--c-create-sheet)] shadow-[0_-10px_50px_var(--c-create-glow)]"
        >
          <div aria-hidden="true" className="mt-2 h-[5px] w-9 shrink-0 self-center rounded-[3px] bg-line2" />
          <div className="flex shrink-0 flex-col gap-3.5 px-5 pt-2.5">
            <div className="flex items-center justify-between">
              <h1 className="m-0 text-[22px] font-bold">{closed ? 'Sửa hóa đơn' : 'Tạo mới'}</h1>
              <Link
                href={closed ? `/phieu/${data.period.id}` : '/'}
                aria-label="Đóng"
                className="flex size-11 items-center justify-center rounded-[22px] border border-line bg-[var(--c-create-panel)] text-text"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-line bg-[var(--c-create-seg-bg)] p-1">
              <button type="button" aria-pressed={tab === 'bill'} onClick={() => setTab('bill')} className={tabClass(tab === 'bill')}>
                Hóa đơn tháng {data.period.month}
              </button>
              <button type="button" aria-pressed={tab === 'expense'} onClick={() => setTab('expense')} className={tabClass(tab === 'expense')}>
                Khoản chi lẻ
              </button>
            </div>
          </div>
          {tab === 'bill' ? (
            <BillTab data={data} editor={editor} />
          ) : (
            <ExpenseTab data={data} onChanged={() => (closed ? undefined : void editor.save(true))} />
          )}
        </div>
      </div>
    </div>
  )
}
