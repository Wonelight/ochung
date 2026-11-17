import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { PlusIcon } from '@/components/button-icons'
import { btnPrimary } from '@/components/button-styles'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { formatVnd } from '@/lib/money'
import { requireCurrentHouse } from '@/server/current-house'
import { summarizeHouseExpenses } from '@/server/expenses'

export const metadata = { title: 'Khoản chi của nhà' }

// View nhanh khoản chi lẻ theo tháng cho MỌI thành viên (kể cả tháng còn nháp): tổng chi tiêu (không gồm khoản cố định, điện, nước),
// số khoản và mỗi người ứng bao nhiêu. Nút "Chi tiết" ở cuối dòng tiêu đề mở màn riêng liệt kê từng khoản của tháng đó.
export default async function LedgerPage() {
  const { actor, current } = await requireCurrentHouse()
  if (current.former) redirect('/')
  const months = await summarizeHouseExpenses(db, actor, current.houseId)
  const canAdd = !current.archived

  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <PageHeader title="Khoản chi của nhà" backHref="/" />
      <p className="m-0 text-[13px] leading-snug text-muted">Chi lẻ từng tháng, không gồm tiền nhà, điện, nước. Ai trong nhà cũng xem được.</p>
      {canAdd && (
        <Link href="/create?tab=expense" className={`${btnPrimary} no-underline`}>
          <PlusIcon />
          Thêm khoản chi
        </Link>
      )}

      {months.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">Chưa có khoản chi lẻ nào.</p>
      ) : (
        months.map((m) => (
          <section key={m.periodId} aria-label={`Tháng ${m.ym.month} năm ${m.ym.year}`} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[17px] font-semibold">
                Tháng {m.ym.month}/{m.ym.year}
              </h2>
              {m.status === 'draft' ? <StatusPill compact tone="draft" text="Đang nhập" /> : <StatusPill compact tone="neutral" text="Đã chốt" />}
              <Link
                href={`/expenses/${m.periodId}`}
                aria-label={`Chi tiết khoản chi tháng ${m.ym.month}`}
                className="ml-auto flex h-10 shrink-0 items-center gap-0.5 rounded-full border border-line2 bg-raised pl-3 pr-2 text-[13px] font-semibold text-accent-text no-underline"
              >
                Chi tiết
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] border border-line2 bg-inner px-3 py-2.5">
                <span className="text-[12px] text-muted">Tổng chi tiêu</span>
                <span className="truncate font-numeric text-[18px] font-semibold tracking-[-0.03em] tabular-nums">{formatVnd(m.total)} đ</span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] border border-line2 bg-inner px-3 py-2.5">
                <span className="text-[12px] text-muted">Số khoản</span>
                <span className="font-numeric text-[18px] font-semibold tracking-[-0.03em] tabular-nums">{m.count}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Ai đã ứng tiền">
              {m.byPayer.map((p) => (
                <span key={p.memberId} className="rounded-full border border-line2 bg-inner px-2.5 py-1 text-[12px] text-muted">
                  {p.name} ứng <span className="font-semibold tabular-nums text-text">{formatVnd(p.total)} đ</span> · {p.count}
                </span>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
