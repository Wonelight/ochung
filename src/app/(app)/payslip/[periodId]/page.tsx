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
import { advancedItems, billsLinkFor, payslipHref, payslipTab, settlement, visibleLines } from '@/lib/payslip-view'
import { dateVn } from '@/lib/vn-time'
import { readOwnProfile } from '@/server/account'
import { getHouseContext } from '@/server/current-house'
import { listAvatarSeeds } from '@/server/houses'
import { getStatuses } from '@/server/payments'
import { loadPayCta } from '../../_lib/pay-data'
import { loadPeriodView } from '../../_lib/period-data'
import { primaryLinkClass, secondaryLinkClass } from '../../_ui/month-hero'
import { MonthItems } from './_ui/month-items'
import { type PickerChip, SubjectPicker } from './_ui/subject-picker'

export const metadata = { title: 'Phiếu tháng' }

// Phiếu thanh toán. Thẻ tháng chép từ mockup `Biểu phí tháng 11` (điện, nước, khoản cố định, tổng tháng), có tiêu đề
// "Cả nhà tháng …" để không bị đọc nhầm là phần của một người; phía trên là phiếu riêng của một người (spec §10): từng dòng
// kèm cách tính, khối "Tổng phần / Trừ tiền đã ứng / Đã chuyển / số còn lại".
// Chủ nhà chọn được người để xem phiếu (?member=<memberId>), có nút "Sửa" và lối sang màn Hóa đơn để xử lý thanh toán.
// Không đòi "nhà đang chọn": link trong thông báo mở thẳng phiếu, kể cả với người đã rời nhà (xem lại, trả nốt phần còn nợ);
// quyền xem do getPeriodView kiểm.
export default async function PayslipPage({ params, searchParams }: PageProps<'/payslip/[periodId]'>) {
  const { actor, houses, current } = await getHouseContext()
  const { periodId } = await params
  const { view, error } = await loadPeriodView(actor, periodId)
  if (!view) {
    if (!error) notFound()
    return (
      <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
        <PageHeader title="Phiếu tháng" backHref="/" />
        <p role="alert" className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] font-medium text-unpaid-fg">
          {error}
        </p>
      </main>
    )
  }

  const { period, result, viewer } = view
  const [profile, seeds] = await Promise.all([readOwnProfile(db, actor), listAvatarSeeds(db, actor, period.houseId)])
  const isOwner = viewer.role === 'owner'
  const archived = houses.find((h) => h.houseId === period.houseId)?.archived ?? true
  const canEdit = isOwner && !archived
  const sp = await searchParams
  const tv = sp.member ?? sp.tv // `tv`: tham số cũ
  const subjectId = isOwner && typeof tv === 'string' && result.payslips.some((p) => p.memberId === tv) ? tv : viewer.memberId
  const slip = result.payslips.find((p) => p.memberId === subjectId)
  const names = new Map(view.members.map((m) => [m.memberId, m.name]))
  const self = subjectId === viewer.memberId
  const subjectName = self ? 'bạn' : (names.get(subjectId) ?? '')
  const ownerName = view.members.find((m) => m.isOwner)?.name ?? 'chủ nhà'
  const statuses = await getStatuses(db, period.id)
  const status = slip && period.status === 'closed' ? statuses[slip.memberId] : undefined
  const pill = status ? pillFor(status) : null
  const cta =
    self && !isOwner && slip && period.status === 'closed'
      ? await loadPayCta({ actor, houseId: period.houseId, period, memberName: profile.name, status })
      : null
  const draft = period.status === 'draft'
  const s = slip
    ? settlement(slip, { self, name: names.get(subjectId) ?? '', ownerName }, { status, draft, advanced: advancedItems(slip.memberId, view.expenses) })
    : null
  const ym = { year: period.year, month: period.month }
  const billsLink = billsLinkFor({
    isOwner,
    self,
    closed: period.status === 'closed',
    archived,
    inCurrentHouse: current?.houseId === period.houseId,
    periodId: period.id,
    status,
  })
  const onlyAdvanced = !!slip && visibleLines(slip.lines).length === 0 && slip.advanced > 0
  const tab = payslipTab(sp.tab)
  // chip "Nhà" giữ ?member= để thẻ cả nhà vẫn ghi "Phần của <người đang xem>"
  const member = self ? undefined : subjectId
  const peopleIds = isOwner ? result.payslips.map((p) => p.memberId) : [viewer.memberId]
  const chips: PickerChip[] = [
    { key: 'house', label: 'Nhà', ariaLabel: 'Cả nhà', href: payslipHref(period.id, { member, tab: 'house' }), seed: null, on: tab === 'house' },
    ...peopleIds.map((id) => {
      const me = id === viewer.memberId
      const name = names.get(id) ?? '—'
      return {
        key: id,
        label: me ? 'Bạn' : name,
        ariaLabel: me ? 'Phiếu của bạn' : `Phiếu của ${name}`,
        href: payslipHref(period.id, { member: me ? undefined : id, tab: 'person' }),
        seed: seeds[id] ?? name,
        on: tab === 'person' && id === subjectId,
      }
    }),
  ]

  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <PageHeader
        title={`Phiếu tháng ${period.month}/${period.year}`}
        backHref={`/?period=${period.id}`}
        action={
          canEdit ? (
            <Link
              href={`/create?period=${period.id}`}
              className="flex h-11 shrink-0 items-center rounded-[22px] border border-line bg-surface px-4 text-[15px] font-semibold text-accent-text no-underline"
            >
              Sửa
            </Link>
          ) : undefined
        }
      />

      <SubjectPicker chips={chips} />

      {tab === 'person' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[17px] font-semibold">{self ? 'Phiếu của bạn' : `Phiếu của ${subjectName}`}</h2>
            {pill ? <StatusPill tone={pill.tone} text={pill.text} /> : period.status === 'draft' ? <StatusPill tone="draft" text="Tạm tính" /> : null}
          </div>

          {!slip || !s ? (
            <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">
              {self ? 'Bạn' : subjectName} không được tính trong tháng này.
            </p>
          ) : (
            <>
              <section aria-label="Tổng kết phiếu" className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-card p-4">
                {s.rows.map((r) => (
                  <div key={r.label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="text-muted">{r.label}</span>
                      <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                        {r.amount < 0 ? `− ${formatVnd(-r.amount)}` : formatVnd(r.amount)} đ
                      </span>
                    </div>
                    {r.items?.map((it) => (
                      <div key={it.key} className="flex items-baseline justify-between gap-3 pl-3 text-[12px] text-muted">
                        <span className="min-w-0">{it.label}</span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">{formatVnd(it.amount)} đ</span>
                      </div>
                    ))}
                  </div>
                ))}
                {s.rows.length > 0 && <div className="h-px bg-line2" />}
                {s.final.amount === null ? (
                  <span className="text-[15px] font-semibold">{s.final.label}</span>
                ) : (
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-[13px] text-muted">{s.final.label}</span>
                    <span
                      className={`shrink-0 whitespace-nowrap font-numeric text-[24px] font-semibold tracking-[-0.04em] tabular-nums ${
                        s.final.muted ? 'text-text' : 'text-accent-text'
                      }`}
                    >
                      {formatVnd(s.final.amount)} đ
                    </span>
                  </div>
                )}
                {draft && slip.due !== null && <p className="m-0 text-[13px] text-muted">Chủ nhà chưa chốt sổ, số có thể còn đổi.</p>}
              </section>

              {billsLink && (
                <Link href={billsLink.href} className={secondaryLinkClass}>
                  {billsLink.label}
                </Link>
              )}

              {cta && (
                <QrSheetButton cta={cta} className={`${primaryLinkClass} h-[54px] cursor-pointer rounded-[27px] font-[inherit] text-[17px]`}>
                  Mã QR chuyển khoản
                </QrSheetButton>
              )}

              <PayslipLines
                lines={slip.lines}
                ym={ym}
                spentOnById={new Map(view.expenses.map((e) => [e.id, e.spentOn]))}
                emptyText={onlyAdvanced ? 'Không được tính tháng này, chỉ hoàn lại khoản đã ứng.' : undefined}
              />
            </>
          )}
        </>
      )}

      {tab === 'house' && (
        <section
          aria-label={`Cả nhà tháng ${period.month} năm ${period.year}`}
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
              <StatusPill tone="draft" text="Tạm tính" />
            )}
          </div>

          <UtilityCard utility="electricity" snapshot={view.utilities.electricity} result={result.electricity} />
          <UtilityCard utility="water" snapshot={view.utilities.water} result={result.water} />
          <MonthItems view={view} />

          <div className="flex items-end justify-between px-1 pb-0.5 pt-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-muted">Tổng cả nhà</span>
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
      )}
    </main>
  )
}
