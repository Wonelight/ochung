import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { PayslipLines } from '@/components/PayslipLines'
import { QrSheetButton } from '@/components/QrSheet'
import { StatusPill } from '@/components/StatusPill'
import { UtilityCard } from '@/components/UtilityCard'
import { formatVnd } from '@/lib/money'
import { pillFor } from '@/lib/payments-view'
import { settlement } from '@/lib/payslip-view'
import { dateVn } from '@/lib/vn-time'
import { requireCurrentHouse } from '@/server/current-house'
import { listMembers } from '@/server/houses'
import { getStatuses } from '@/server/payments'
import { loadPayCta } from '../../_lib/pay-data'
import { loadPeriodView } from '../../_lib/period-data'
import { primaryLinkClass } from '../../_ui/month-hero'
import { MonthItems } from './_ui/month-items'
import { SubjectPicker } from './_ui/subject-picker'

export const metadata = { title: 'Biểu phí tháng' }

// Phiếu thanh toán. Thẻ tháng chép từ mockup `Biểu phí tháng 11` (điện, nước, khoản cố định, tổng tháng); phần dưới là
// phiếu riêng của người đang xem (spec §10): từng dòng kèm cách tính, khối "Tổng phần / Trừ tiền đã ứng / Cần chuyển".
// Chủ nhà chọn được người để xem phiếu (?tv=<memberId>) và có nút "Sửa".
export default async function PayslipPage({ params, searchParams }: PageProps<'/phieu/[periodId]'>) {
  const { actor, current } = await requireCurrentHouse()
  const { periodId } = await params
  const { view, error } = await loadPeriodView(actor, periodId)
  if (!view) {
    if (!error) notFound()
    return (
      <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
        <PageHeader title="Biểu phí tháng" backHref="/" />
        <p role="alert" className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      </main>
    )
  }

  const { period, result } = view
  const members = await listMembers(db, actor, period.houseId)
  const me = members.find((m) => m.userId === actor.userId)
  const isOwner = me?.role === 'owner'
  const archived = period.houseId === current.houseId ? current.archived : true
  const canEdit = isOwner && !archived
  const tv = (await searchParams).tv
  const subjectId = isOwner && typeof tv === 'string' && result.payslips.some((p) => p.memberId === tv) ? tv : (me?.id ?? '')
  const slip = result.payslips.find((p) => p.memberId === subjectId)
  const names = new Map(view.members.map((m) => [m.memberId, m.name]))
  const self = subjectId === me?.id
  const subjectName = self ? 'bạn' : (names.get(subjectId) ?? '')
  const ownerName = view.members.find((m) => m.isOwner)?.name ?? 'chủ nhà'
  const statuses = await getStatuses(db, period.id)
  const status = slip && period.status === 'closed' ? statuses[slip.memberId] : undefined
  const pill = status ? pillFor(status) : null
  const cta =
    self && !isOwner && slip && period.status === 'closed'
      ? await loadPayCta({ actor, houseId: period.houseId, period, memberName: me?.displayName ?? '', status })
      : null
  const s = slip ? settlement(slip, { self, name: names.get(subjectId) ?? '', ownerName }) : null
  const ym = { year: period.year, month: period.month }

  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2">
        <Link
          href={`/?ky=${period.id}`}
          aria-label="Quay lại"
          className="flex size-11 shrink-0 items-center justify-center rounded-[22px] border border-line bg-surface text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="m-0 flex-1 text-center text-[17px] font-semibold">Biểu phí tháng</h1>
        {canEdit ? (
          <Link
            href={`/tao?ky=${period.id}`}
            className="flex h-11 shrink-0 items-center rounded-[22px] border border-line bg-surface px-4 text-[15px] font-semibold text-accent-text no-underline"
          >
            Sửa
          </Link>
        ) : (
          <span className="w-11 shrink-0" />
        )}
      </header>

      <section
        aria-label={`Tháng ${period.month} năm ${period.year}`}
        className="relative flex flex-col gap-2.5 overflow-hidden rounded-[28px] border border-line bg-card p-4"
      >
        <svg width="100%" height="70" viewBox="0 0 350 70" preserveAspectRatio="none" aria-hidden="true" className="absolute left-0 top-0 block">
          <circle cx="262" cy="44" r="22" fill="#E8833A" style={{ fillOpacity: 'var(--c-sun-op)' }} />
          <path d="M0 52 Q90 32 180 48 T350 40 V70 H0Z" style={{ fill: 'var(--c-ridge)' }} />
        </svg>
        <div className="relative flex items-center justify-between px-1 pb-2.5 pt-0.5">
          <div className="flex items-baseline gap-2">
            <span className="font-numeric text-[28px] font-semibold tracking-[-0.04em]">{period.month}</span>
            <span className="text-[15px] text-muted">/ {period.year}</span>
          </div>
          {period.status === 'closed' && period.closedAt ? (
            <StatusPill tone="neutral" text={`Chốt sổ ${dateVn(period.closedAt)}`} />
          ) : (
            <StatusPill tone="draft" text="Nháp — chưa gửi" />
          )}
        </div>

        <UtilityCard utility="electricity" snapshot={view.utilities.electricity} result={result.electricity} />
        <UtilityCard utility="water" snapshot={view.utilities.water} result={result.water} />
        <MonthItems view={view} />

        <div className="flex items-end justify-between px-1 pb-0.5 pt-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-muted">Tổng tháng</span>
            <span className="font-numeric text-[22px] font-semibold tracking-[-0.04em] tabular-nums">{formatVnd(result.grandTotal)} đ</span>
          </div>
          {slip && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[12px] text-muted">Phần của {subjectName}</span>
              <span className="font-numeric text-[15px] font-semibold tracking-[-0.03em] text-accent-text tabular-nums">{formatVnd(slip.share)} đ</span>
            </div>
          )}
        </div>
      </section>

      {isOwner && result.payslips.length > 0 && (
        <SubjectPicker
          periodId={period.id}
          selectedId={subjectId}
          people={result.payslips.map((p) => ({ id: p.memberId, name: names.get(p.memberId) ?? '—' }))}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[17px] font-semibold">{self ? 'Phiếu của bạn' : `Phiếu của ${subjectName}`}</h2>
        {pill && <StatusPill tone={pill.tone} text={pill.text} />}
      </div>

      {!slip || !s ? (
        <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">
          {self ? 'Bạn' : subjectName} không được tính trong tháng này.
        </p>
      ) : (
        <>
          <PayslipLines lines={slip.lines} ym={ym} spentOnById={new Map(view.expenses.map((e) => [e.id, e.spentOn]))} />

          <section aria-label="Tổng kết phiếu" className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-card p-4">
            {s.rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="text-muted">{r.label}</span>
                <span className="font-semibold tabular-nums">{r.amount < 0 ? `− ${formatVnd(-r.amount)}` : formatVnd(r.amount)} đ</span>
              </div>
            ))}
            {s.rows.length > 0 && <div className="h-px bg-line2" />}
            <div className="flex items-end justify-between gap-3">
              <span className="text-[13px] text-muted">{s.final.label}</span>
              <span className="font-numeric text-[24px] font-semibold tracking-[-0.04em] text-accent-text tabular-nums">
                {formatVnd(s.final.amount)} đ
              </span>
            </div>
          </section>

          {cta && (
            <QrSheetButton cta={cta} className={`${primaryLinkClass} h-[54px] cursor-pointer rounded-[27px] font-[inherit] text-[17px]`}>
              Mã QR chuyển khoản
            </QrSheetButton>
          )}
        </>
      )}
    </main>
  )
}
