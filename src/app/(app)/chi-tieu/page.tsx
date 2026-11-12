import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { formatVnd } from '@/lib/money'
import { dayMonth } from '@/lib/vn-time'
import { requireCurrentHouse } from '@/server/current-house'
import { listHouseExpenses } from '@/server/expenses'

export const metadata = { title: 'Khoản chi của nhà' }

// Sổ khoản chi: MỌI thành viên xem được khoản chi lẻ của cả nhà (kể cả tháng còn nháp) để minh bạch: ai trả, ai nhập, chia cho ai.
// Chỉ có khoản chi, không có điện/nước/tổng tháng nên không lộ số của tháng chưa chốt. Chỉ đọc; sửa/xóa ở trang Tạo.
export default async function LedgerPage() {
  const { actor, current } = await requireCurrentHouse()
  if (current.former) redirect('/')
  const months = await listHouseExpenses(db, actor, current.houseId)
  const canAdd = !current.archived

  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <PageHeader title="Khoản chi của nhà" backHref="/" />
      <p className="m-0 text-[13px] leading-snug text-muted">Mọi khoản chi lẻ của cả nhà, ai trả và chia cho ai. Ai trong nhà cũng xem được.</p>
      {canAdd && (
        <Link
          href="/tao"
          className="flex h-11 items-center justify-center rounded-[22px] border-0 bg-accent px-5 text-[14px] font-bold text-[#1A0F06] no-underline"
        >
          Thêm khoản chi
        </Link>
      )}

      {months.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">Chưa có khoản chi lẻ nào.</p>
      ) : (
        months.map((m) => {
          const paid = new Map<string, { name: string; total: number }>()
          for (const e of m.expenses) {
            const cur = paid.get(e.paidByMemberId) ?? { name: e.paidByName, total: 0 }
            paid.set(e.paidByMemberId, { name: cur.name, total: cur.total + e.amount })
          }
          return (
            <section key={m.periodId} aria-label={`Tháng ${m.ym.month} năm ${m.ym.year}`} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-[17px] font-semibold">
                  Tháng {m.ym.month}/{m.ym.year}
                </h2>
                {m.status === 'draft' ? <StatusPill tone="draft" text="Đang nhập" /> : <StatusPill tone="neutral" text="Đã chốt" />}
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Ai đã ứng tiền">
                {[...paid.values()].map((p) => (
                  <span key={p.name} className="rounded-full bg-inner px-2.5 py-1 text-[12px] text-muted">
                    {p.name} ứng <span className="font-semibold tabular-nums text-text">{formatVnd(p.total)} đ</span>
                  </span>
                ))}
              </div>
              <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
                {m.expenses.map((e, i) => (
                  <div key={e.id} className={`flex items-start gap-3 py-3 ${i < m.expenses.length - 1 ? 'border-b border-line' : ''}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-medium leading-snug">
                        {e.description}
                        {e.mine && <span className="text-[12px] font-medium text-accent-text"> · của bạn</span>}
                      </span>
                      <span className="text-[12px] text-muted">
                        {e.paidByName} trả · {dayMonth(e.spentOn)}
                        {e.createdByName !== e.paidByName && ` · ${e.createdByName} nhập`}
                      </span>
                      <span className="text-[12px] text-muted">
                        Chia cho: {e.participants ? e.participants.map((p) => p.name).join(', ') : 'Cả nhà'}
                      </span>
                    </div>
                    <span className="shrink-0 font-numeric text-[14px] font-semibold tracking-[-0.03em] tabular-nums">{formatVnd(e.amount)} đ</span>
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </main>
  )
}
