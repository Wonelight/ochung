import Link from 'next/link'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { formatVnd } from '@/lib/money'
import { collectionSummary, paymentRows } from '@/lib/payments-view'
import { pickPeriod } from '@/lib/period-pick'
import { requireCurrentHouse } from '@/server/current-house'
import { getPaymentDetails, getStatuses } from '@/server/payments'
import { listPeriods } from '@/server/periods'
import { loadPeriodView, periodParam } from '../_lib/period-data'
import { primaryLinkClass } from '../_ui/month-hero'
import { BillsList, type OwnerBills } from './_ui/bills-list'
import { MonthPicker } from './_ui/month-picker'

export const metadata = { title: 'Hóa đơn' }

/** Số tháng trước hiện trong "Các tháng trước". */
const PREVIOUS_MAX = 6

// Màn Hóa đơn theo mockup `Hóa đơn tháng 11`: thẻ "Đã thu", bộ lọc Tất cả / Chưa trả / Chờ duyệt / Đã trả, danh sách
// từng người với số tiền riêng (spec §10), "Các tháng trước". Tháng nháp (chỉ chủ nhà thấy) chưa có trạng thái nên không có bộ lọc.
export default async function BillsPage({ searchParams }: PageProps<'/hoa-don'>) {
  const { actor, current } = await requireCurrentHouse()
  const now = new Date()
  const periods = await listPeriods(db, actor, current.houseId)
  const pick = pickPeriod(periods, periodParam((await searchParams).ky))

  if (!pick) {
    return (
      <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
        <PageHeader title="Hóa đơn" backHref="/" />
        <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">Chưa có hóa đơn nào.</p>
      </main>
    )
  }

  const p = pick.current
  const { view, error } = await loadPeriodView(actor, p.id)
  const statuses = view ? await getStatuses(db, p.id) : {}
  const rows = view
    ? paymentRows({
        status: p.status,
        dueDate: view.period.dueDate,
        payslips: view.result.payslips,
        names: new Map(view.members.map((m) => [m.memberId, m.name])),
        statuses,
        now,
      })
    : []
  const canEdit = current.role === 'owner' && !current.archived
  // Thao tác thu tiền chỉ dành cho chủ nhà của nhà đang dùng, trên tháng đã chốt. Ảnh chứng từ chỉ đi theo đây (getPaymentDetails đã kiểm quyền).
  const owner: OwnerBills | null =
    view && canEdit && p.status === 'closed'
      ? { periodId: p.id, info: ownerInfo(statuses, await getPaymentDetails(db, actor, p.id)) }
      : null

  const previous = periods.filter((x) => x.status === 'closed' && x.id !== p.id).slice(0, PREVIOUS_MAX)
  const previousStatuses = await Promise.all(previous.map((x) => getStatuses(db, x.id)))

  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2">
        <Link
          href={`/?ky=${p.id}`}
          aria-label="Quay lại"
          className="flex size-11 shrink-0 items-center justify-center rounded-[22px] border border-line bg-surface text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="m-0 flex-1 text-center text-[17px] font-semibold">Hóa đơn</h1>
        <MonthPicker
          currentId={p.id}
          months={periods.map((x) => ({ id: x.id, label: `T${x.month}/${x.year}`, draft: x.status === 'draft' }))}
        />
      </header>

      {!view ? (
        <div className="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4">
          <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
            {error}
          </p>
          {canEdit && (
            <Link href={`/tao?ky=${p.id}`} className={primaryLinkClass}>
              Tiếp tục nhập
            </Link>
          )}
        </div>
      ) : p.status === 'draft' ? (
        <div className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-muted">Tổng tháng {p.month}</span>
            <StatusPill tone="draft" text="Nháp — chưa gửi" />
          </div>
          <span className="font-numeric text-[24px] font-semibold tracking-[-0.04em] tabular-nums">{formatVnd(view.result.grandTotal)} đ</span>
          {canEdit && (
            <Link href={`/tao?ky=${p.id}`} className={primaryLinkClass}>
              Tiếp tục nhập
            </Link>
          )}
        </div>
      ) : (
        <CollectedCard summary={collectionSummary(view.result.payslips, statuses)} />
      )}

      {view && <BillsList key={p.id} rows={rows} showFilters={p.status === 'closed'} owner={owner} />}

      {previous.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Các tháng trước</h2>
          <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
            {previous.map((x, i) => {
              const st = Object.values(previousStatuses[i])
              const paid = st.filter((s) => s.kind === 'paid').length
              const done = paid === st.length
              return (
                <Link
                  key={x.id}
                  href={`/hoa-don?ky=${x.id}`}
                  className={`flex min-h-14 items-center gap-3 text-text no-underline ${i < previous.length - 1 ? 'border-b border-line' : ''}`}
                >
                  <span className="flex-1 text-[15px] font-medium">
                    Tháng {x.month}
                    {x.year !== p.year ? `/${x.year}` : ''}
                  </span>
                  <span className="text-[14px] font-semibold tabular-nums">{formatVnd(x.grandTotal ?? 0)} đ</span>
                  <StatusPill compact tone={done ? 'paid' : 'unpaid'} text={done ? `Đủ ${paid}/${st.length}` : `Còn ${st.length - paid}/${st.length}`} />
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}

function CollectedCard({ summary }: { summary: ReturnType<typeof collectionSummary> }) {
  const ratio = summary.expected > 0 ? Math.min(1, summary.collected / summary.expected) : 1
  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-muted">Đã thu</span>
        <span className="text-[13px] text-muted">
          {summary.paidCount}/{summary.payerCount} người
        </span>
      </div>
      <span className="font-numeric text-[24px] font-semibold tracking-[-0.04em] tabular-nums">
        {formatVnd(summary.collected)}{' '}
        <span className="text-[14px] tracking-[-0.02em] text-muted">/ {formatVnd(summary.expected)} đ</span>
      </span>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-track">
        <div className="h-1.5 rounded-[3px] bg-accent shadow-[0_0_10px_var(--c-glow)]" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  )
}

/** Mỗi người: loại trạng thái, số dư và khoản đang chờ duyệt (nếu có) cho các nút của chủ nhà. */
function ownerInfo(statuses: Awaited<ReturnType<typeof getStatuses>>, details: Awaited<ReturnType<typeof getPaymentDetails>>): OwnerBills['info'] {
  const info: OwnerBills['info'] = {}
  for (const [memberId, s] of Object.entries(statuses)) {
    const pending = details.find((d) => d.memberId === memberId && d.direction === 'in' && d.status === 'pending')
    info[memberId] = { kind: s.kind, balance: s.balance, pending: pending ? { id: pending.id, proofUrl: pending.proofUrl } : null }
  }
  return info
}
