'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { BillTab } from './bill-tab'
import { ExpenseTab } from './expense-tab'
import type { CreateData } from './types'
import { usePeriodEditor } from './use-period-editor'

// Trang Tạo hóa đơn: trang thường (không phải tấm nổi) với nút quay lại + tiêu đề như các trang con, ô chọn 2 tab trên nền
// segBg, nội dung cuộn cùng trang. Chân trang (tổng tháng + nút chính) dính đáy màn hình; thanh điều hướng dưới được ẩn ở đây.
export function CreateForm({ data, initialTab }: { data: CreateData; initialTab: 'bill' | 'expense' }) {
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
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-col gap-3.5 px-5 pt-[max(58px,env(safe-area-inset-top))]">
        <PageHeader title={closed ? 'Sửa hóa đơn' : 'Tạo hóa đơn'} backHref={closed ? `/phieu/${data.period.id}` : '/'} />
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
    </main>
  )
}
