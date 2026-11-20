'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { ExpenseTab } from './expense-tab'
import type { ExpenseTabData } from './types'

// Trang Thêm khoản chi của thành viên (nút "+"): chỉ có form khoản chi lẻ, không có hóa đơn tháng (việc của chủ nhà).
// Dùng lại đúng form và chân trang của tab "Khoản chi lẻ" bên chủ nhà.
export function MemberExpenseForm({ data, initialEditId = null }: { data: ExpenseTabData; initialEditId?: string | null }) {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-col gap-3 px-5 pt-[max(24px,env(safe-area-inset-top))]">
        <PageHeader title="Thêm khoản chi" backHref="/" />
        <p className="m-0 text-[13px] leading-snug text-muted">Khoản bạn đã trả cho cả nhà hoặc cho một số người (chọn ở mục Chia cho). Chủ nhà sẽ tính vào hóa đơn khi chốt sổ.</p>
        <Link href="/expenses" className="flex min-h-11 items-center self-start text-[14px] font-semibold text-accent-text no-underline">
          Xem tất cả khoản chi của nhà
        </Link>
      </div>
      <ExpenseTab data={data} onChanged={() => undefined} initialEditId={initialEditId} />
    </main>
  )
}
