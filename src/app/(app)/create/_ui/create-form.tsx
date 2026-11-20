'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { BillTab } from './bill-tab'
import { ExpenseTab } from './expense-tab'
import { expenseDataOf, type CreateData } from './types'
import { usePeriodEditor } from './use-period-editor'

const arrowClass = 'flex size-11 items-center justify-center rounded-[22px] border border-line2 bg-raised p-0 text-text'
const arrowOffClass = 'flex size-11 items-center justify-center rounded-[22px] border border-line bg-card p-0 text-disabled'

/** Chủ nhà tự chọn tháng làm hóa đơn: mũi tên lùi/tiến trong khoảng chọn được (xem `createMonthNav`). Giữ nguyên tab đang mở. */
function MonthSwitcher({
  year,
  month,
  nav,
  tab,
}: {
  year: number
  month: number
  nav: { olderHref: string | null; newerHref: string | null }
  tab: 'bill' | 'expense'
}) {
  const arrow = (href: string | null, label: string, d: string) => {
    const icon = (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    )
    if (!href) {
      return (
        <button type="button" aria-label={label} disabled className={arrowOffClass}>
          {icon}
        </button>
      )
    }
    return (
      <Link href={tab === 'expense' ? `${href}&tab=expense` : href} aria-label={label} className={arrowClass}>
        {icon}
      </Link>
    )
  }
  return (
    <div className="flex items-center justify-between" role="group" aria-label="Chọn tháng">
      {arrow(nav.olderHref, 'Tháng trước', 'm15 18-6-6 6-6')}
      <span className="text-[15px] font-semibold">
        Tháng {month}/{year}
      </span>
      {arrow(nav.newerHref, 'Tháng sau', 'm9 18 6-6-6-6')}
    </div>
  )
}

// Trang Tạo hóa đơn: trang thường (không phải tấm nổi) với nút quay lại + tiêu đề như các trang con, ô chọn 2 tab trên nền
// segBg, nội dung cuộn cùng trang. Chân trang (tổng tháng + nút chính) dính đáy màn hình; thanh điều hướng dưới được ẩn ở đây.
export function CreateForm({ data, initialTab, initialEditId = null }: { data: CreateData; initialTab: 'bill' | 'expense'; initialEditId?: string | null }) {
  const [tab, setTab] = useState(initialTab)
  const closed = data.period.status === 'closed'
  const editor = usePeriodEditor({
    periodId: data.period.id,
    snapshot: data.snapshot,
    closed,
    initialPreview: data.initialPreview,
  })

  // tab hiện tại nằm trên địa chỉ (?tab=expense): tải lại hoặc bấm quay lại không bị đưa về tab hóa đơn
  function chooseTab(next: 'bill' | 'expense') {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'expense') url.searchParams.set('tab', 'expense')
    else url.searchParams.delete('tab')
    window.history.replaceState(null, '', url)
  }

  const tabClass = (on: boolean) =>
    `h-10 cursor-pointer rounded-[12px] border-0 font-[inherit] text-[14px] font-semibold ${
      on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'bg-transparent text-muted'
    }`

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-col gap-3.5 px-5 pt-[max(24px,env(safe-area-inset-top))]">
        <PageHeader title={closed ? 'Sửa hóa đơn' : 'Tạo hóa đơn'} backHref={closed ? `/payslip/${data.period.id}` : '/'} />
        <MonthSwitcher year={data.period.year} month={data.period.month} nav={data.monthNav} tab={tab} />
        <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-line bg-[var(--c-create-seg-bg)] p-1">
          <button type="button" aria-pressed={tab === 'bill'} onClick={() => chooseTab('bill')} className={tabClass(tab === 'bill')}>
            Hóa đơn tháng {data.period.month}
          </button>
          <button type="button" aria-pressed={tab === 'expense'} onClick={() => chooseTab('expense')} className={tabClass(tab === 'expense')}>
            Khoản chi lẻ
          </button>
        </div>
      </div>
      {tab === 'bill' ? (
        <BillTab data={data} editor={editor} />
      ) : (
        <ExpenseTab
          data={expenseDataOf(
            data,
            Object.entries(editor.state.members)
              .filter(([, m]) => !m.included)
              .map(([id]) => id),
          )}
          onChanged={() => (closed ? undefined : void editor.save(true))}
          initialEditId={initialEditId}
        />
      )}
    </main>
  )
}
