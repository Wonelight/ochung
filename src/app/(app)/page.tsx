import Link from 'next/link'
import { db } from '@/db'
import { Avatar } from '@/components/Avatar'
import { Bell } from '@/components/Bell'
import { HouseSwitcher } from '@/components/HouseSwitcher'
import { InstallGuide } from '@/components/InstallGuide'
import { MemberRow } from '@/components/MemberRow'
import { Money } from '@/components/Money'
import { MonthHeader } from '@/components/MonthHeader'
import { QrSheetButton } from '@/components/QrSheet'
import { StatusPill } from '@/components/StatusPill'
import { consumptionMonthDefault } from '@/lib/billing/period-month'
import { homeTiles } from '@/lib/home-tiles'
import { formatVnd } from '@/lib/money'
import { collectionSummary, paymentRows, pillFor } from '@/lib/payments-view'
import { pickPeriod } from '@/lib/period-pick'
import { greetingVi } from '@/lib/vn-time'
import { requireCurrentHouse } from '@/server/current-house'
import { listMembers } from '@/server/houses'
import { unreadCount } from '@/server/notifications'
import { getStatuses } from '@/server/payments'
import { listPeriods } from '@/server/periods'
import { loadPayCta } from './_lib/pay-data'
import { loadPeriodView, periodParam } from './_lib/period-data'
import { CollectProgress, MonthHero, primaryLinkClass, secondaryLinkClass } from './_ui/month-hero'
import { MonthTiles } from './_ui/month-tiles'

// Trang chủ theo mockup `Trang chủ — tháng 11`. Khác mockup theo spec §10: thành viên thấy số tiền của mình + trạng thái
// + "Xem phiếu"/"Mã QR" thay cho "mỗi người · chia 4"; chủ nhà thấy tiến độ "Đã thu X / Y đ"; danh sách thanh toán hiện
// số tiền riêng của từng người. Tháng hiển thị: tháng mới nhất người xem thấy được (chủ nhà: cả nháp), mũi tên đi qua các tháng đó.
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { actor, current } = await requireCurrentHouse()
  const now = new Date()
  const [members, periods, unread] = await Promise.all([
    listMembers(db, actor, current.houseId),
    listPeriods(db, actor, current.houseId),
    unreadCount(db, actor),
  ])
  const me = members.find((m) => m.userId === actor.userId)
  const isOwner = current.role === 'owner'
  const canEdit = isOwner && !current.archived
  const pick = pickPeriod(periods, periodParam((await searchParams).ky))
  const { view, error } = pick ? await loadPeriodView(actor, pick.current.id) : { view: null, error: null }
  const statuses = view ? await getStatuses(db, view.period.id) : {}
  const myName = me?.displayName ?? ''

  const header = (
    <header className="flex items-center gap-3">
      <Link href="/cai-dat" aria-label="Hồ sơ của bạn" className="flex size-11 shrink-0 rounded-[22px] no-underline">
        <Avatar seed={myName} size={44} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] text-muted">
          {greetingVi(now)}, {myName}
        </span>
        <HouseSwitcher />
      </div>
      <Bell unread={unread} />
    </header>
  )

  if (!pick) {
    const ym = consumptionMonthDefault(now)
    return (
      <main className="flex flex-col gap-[18px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
        {header}
        <InstallGuide />
        <MonthHero year={ym.year} month={ym.month}>
          <MonthHeader year={ym.year} month={ym.month} olderHref={null} newerHref={null} />
          <div className="relative mt-2 flex flex-col gap-1">
            <span className="text-[17px] font-semibold">Chưa có hóa đơn nào</span>
            <span className="text-[13px] text-muted">
              {canEdit ? 'Nhập điện nước và các khoản của tháng để tạo hóa đơn đầu tiên.' : 'Chủ nhà chưa gửi hóa đơn tháng nào.'}
            </span>
          </div>
          {canEdit && (
            <Link href="/tao" className={primaryLinkClass}>
              Tạo hóa đơn
            </Link>
          )}
        </MonthHero>
      </main>
    )
  }

  const p = pick.current
  const href = (id: string | null) => (id ? `/?ky=${id}` : null)
  const payslipHref = `/phieu/${p.id}`
  const draft = p.status === 'draft'
  const result = view?.result
  const mySlip = result?.payslips.find((s) => s.memberId === me?.id)
  const names = new Map(view?.members.map((m) => [m.memberId, m.name]) ?? [])
  const rows = view
    ? paymentRows({ status: p.status, dueDate: view.period.dueDate, payslips: view.result.payslips, names, statuses, now })
    : []

  let summary: React.ReactNode = null
  let action: React.ReactNode = null
  if (result) {
    if (isOwner) {
      summary = mySlip ? (
        <>
          Phần của bạn {formatVnd(mySlip.share)} đ · {result.payslips.length} người
        </>
      ) : (
        <>{result.payslips.length} người</>
      )
      if (draft) {
        action = (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <StatusPill tone="draft" text="Nháp — chưa gửi" />
              <span className="text-[13px] text-muted">Cả nhà chưa thấy tháng này</span>
            </div>
            {canEdit && (
              <Link href={`/tao?ky=${p.id}`} className={primaryLinkClass}>
                Tiếp tục nhập
              </Link>
            )}
          </div>
        )
      } else {
        const c = collectionSummary(result.payslips, statuses)
        action = (
          <CollectProgress
            ratio={c.expected > 0 ? c.collected / c.expected : 1}
            left={`Đã thu ${formatVnd(c.collected)} / ${formatVnd(c.expected)} đ`}
            right={`${c.paidCount}/${c.payerCount} người đã trả`}
          />
        )
      }
    } else {
      const status = mySlip ? statuses[mySlip.memberId] : undefined
      const pill = status ? pillFor(status) : null
      summary = !mySlip ? (
        'Bạn không được tính trong tháng này'
      ) : mySlip.due !== null && mySlip.due < 0 ? (
        <>
          Chủ nhà cần trả lại bạn <span className="font-semibold text-text">{formatVnd(-mySlip.due)} đ</span>
        </>
      ) : (
        <>
          Bạn cần chuyển <span className="font-semibold text-text">{formatVnd(mySlip.due ?? mySlip.share)} đ</span>
        </>
      )
      if (pill) summary = (
        <span className="flex items-center justify-between gap-3">
          <span>{summary}</span>
          <StatusPill tone={pill.tone} text={pill.text} />
        </span>
      )
      const cta =
        mySlip && p.status === 'closed'
          ? await loadPayCta({ actor, houseId: current.houseId, period: p, memberName: myName, status })
          : null
      action = (
        <div className={`grid gap-2.5 ${cta ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Link href={payslipHref} className={secondaryLinkClass}>
            Xem phiếu
          </Link>
          {cta && (
            <QrSheetButton cta={cta} className={`${primaryLinkClass} cursor-pointer font-[inherit]`}>
              Mã QR
            </QrSheetButton>
          )}
        </div>
      )
    }
  }

  return (
    <main className="flex flex-col gap-[18px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      {header}
      <InstallGuide />

      <MonthHero year={p.year} month={p.month}>
        <MonthHeader year={p.year} month={p.month} olderHref={href(pick.olderId)} newerHref={href(pick.newerId)} />
        <div className="relative mt-2 flex flex-col gap-1">
          <span className="text-[13px] text-muted">Tổng chi tháng này</span>
          {result ? (
            <Money
              amount={result.grandTotal}
              className="font-numeric text-[34px] font-semibold tracking-[-0.04em] tabular-nums"
              unitClassName="ml-1.5 text-[18px] text-muted"
            />
          ) : (
            <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
              {error}
            </p>
          )}
          {summary && <span className="text-[13px] text-muted">{summary}</span>}
        </div>
        {action}
        {!result && draft && <StatusPill tone="draft" text="Nháp — chưa gửi" className="self-start" />}
        {!result && canEdit && (
          <Link href={`/tao?ky=${p.id}`} className={primaryLinkClass}>
            Tiếp tục nhập
          </Link>
        )}
        {view && <MonthTiles tiles={homeTiles(view)} href={payslipHref} />}
      </MonthHero>

      {rows.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[17px] font-semibold">Thanh toán tháng này</h2>
            <Link href={`/hoa-don?ky=${p.id}`} className="flex min-h-11 items-center gap-0.5 text-[14px] font-medium text-accent-text no-underline">
              Tất cả hóa đơn
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </div>
          <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
            {rows.map((r, i) => (
              <MemberRow
                key={r.memberId}
                variant="home"
                name={r.name}
                note={r.note}
                last={i === rows.length - 1}
                aside={
                  <div className="flex shrink-0 flex-col items-end gap-1 py-2">
                    <span className="font-numeric text-[14px] font-semibold tracking-[-0.03em] tabular-nums">{formatVnd(r.amount)} đ</span>
                    {r.pill && <StatusPill tone={r.pill.tone} text={r.pill.text} />}
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
