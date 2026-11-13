import Link from 'next/link'
import { db } from '@/db'
import { QrSheetButton } from '@/components/QrSheet'
import { StatusPill } from '@/components/StatusPill'
import { formatVnd } from '@/lib/money'
import { memberBalance, pillFor } from '@/lib/payments-view'
import type { Actor } from '@/server/actor'
import { getStatuses } from '@/server/payments'
import { loadPayCta } from '../_lib/pay-data'
import { loadPeriodView } from '../_lib/period-data'
import { primaryLinkClass, secondaryLinkClass } from './month-hero'

/**
 * Thẻ gọn của thành viên về tháng ĐÃ CHỐT gần nhất: số cần chuyển (hoặc đã trả đủ), trạng thái thanh toán và nút "Mã QR".
 * Trang chủ mặc định mở tháng mới nhất mà thành viên giờ cũng thấy khi còn nháp, nên việc phải làm ngay (chuyển tiền
 * tháng vừa chốt) không được chìm sau tháng nháp. Không có phiếu của người này trong tháng đó thì không hiện gì.
 */
export async function OwedCard({
  actor,
  houseId,
  period,
  memberName,
}: {
  actor: Actor
  houseId: string
  period: { id: string; year: number; month: number }
  memberName: string
}) {
  const { view } = await loadPeriodView(actor, period.id)
  const slip = view?.result.payslips.find((s) => s.memberId === view.viewer.memberId)
  if (!view || !slip) return null
  const status = (await getStatuses(db, period.id))[slip.memberId]
  const bal = memberBalance(slip, status)
  const pill = status ? pillFor(status) : null
  const cta = await loadPayCta({ actor, houseId, period, memberName, status })

  return (
    <section aria-label={`Thanh toán tháng ${period.month}`} className="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold">Tháng {period.month} đã chốt</h2>
        {pill && <StatusPill tone={pill.tone} text={pill.text} />}
      </div>
      <span className="text-[14px] text-muted">
        {bal.text}
        {bal.amount !== null && <span className="font-semibold text-text"> {formatVnd(bal.amount)} đ</span>}
        {bal.original !== null && <> · phiếu {formatVnd(bal.original)} đ</>}
      </span>
      <div className={`grid gap-2.5 ${cta ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Link href={`/phieu/${period.id}`} className={secondaryLinkClass}>
          Xem phiếu
        </Link>
        {cta && (
          <QrSheetButton cta={cta} className={`${primaryLinkClass} cursor-pointer font-[inherit]`}>
            Mã QR
          </QrSheetButton>
        )}
      </div>
    </section>
  )
}
