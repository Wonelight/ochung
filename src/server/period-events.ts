import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { houseMembers, periodMembers, periods, user } from '@/db/schema'
import { formatVnd } from '@/lib/money'
import { dayMonth } from '@/lib/vn-time'
import { afterCommit, deliver, type DeliveryItem } from './notifications'
import { getPushSender } from './push'

/** Gửi một thông báo đẩy; 'gone' = subscription đã hết hiệu lực (404/410), người gọi xóa nó. Bản thật ở `push.ts`. */
export type PushSender = (
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string },
) => Promise<'ok' | 'gone'>

export type PeriodEventDeps = { send?: PushSender }

/**
 * Gọi SAU khi transaction chốt sổ đã commit (không gọi bên trong transaction).
 * Mỗi người có phiếu nhận một thông báo (trong app + push) với số tiền của riêng mình; chủ nhà nhận "Đã chốt sổ tháng M".
 * Mọi lỗi bên trong chỉ được ghi log: số liệu đã lưu rồi nên không được nổi lên thành "lưu thất bại".
 */
export async function onPeriodClosed(db: Db, periodId: string, deps?: PeriodEventDeps): Promise<void> {
  await afterCommit('Thông báo chốt sổ', () => announce(db, periodId, 'period_closed', deps?.send ?? getPushSender()))
}

/**
 * Gọi đúng một lần cho mỗi thao tác sửa tháng đã chốt, SAU khi commit. Thành viên có phiếu nhận "Phiếu tháng M đã cập nhật"
 * (chủ nhà là người sửa nên không nhận). Lỗi bên trong chỉ được ghi log như `onPeriodClosed`.
 */
export async function onPeriodUpdated(db: Db, periodId: string, deps?: PeriodEventDeps): Promise<void> {
  await afterCommit('Thông báo cập nhật phiếu', () => announce(db, periodId, 'period_updated', deps?.send ?? getPushSender()))
}

const amountText = (n: number) => `${formatVnd(n)}đ`

async function announce(db: Db, periodId: string, kind: 'period_closed' | 'period_updated', send: PushSender): Promise<void> {
  const [period] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1)
  if (!period || period.status !== 'closed' || !period.result) return
  const slips = new Map(period.result.payslips.map((p) => [p.memberId, p]))

  // Người nhận: thành viên được tính tháng này và có phiếu, còn tài khoản hoạt động. Không lọc theo `leftAt`: người đã rời
  // nhà sau khi có phiếu vẫn phải biết số tiền của mình.
  const rows = await db
    .select({
      memberId: periodMembers.memberId,
      included: periodMembers.included,
      userId: houseMembers.userId,
      banned: user.banned,
      banExpires: user.banExpires,
    })
    .from(periodMembers)
    .innerJoin(houseMembers, eq(houseMembers.id, periodMembers.memberId))
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .where(eq(periodMembers.periodId, periodId))

  const now = Date.now()
  const base = { houseId: period.houseId, kind, push: true } as const
  const month = period.month
  const items: DeliveryItem[] = []
  for (const r of rows) {
    const slip = slips.get(r.memberId)
    if (!r.included || !slip) continue
    if (r.banned === true && (!r.banExpires || r.banExpires.getTime() > now)) continue

    if (slip.due === null) {
      // chủ nhà: chỉ nhận khi chốt sổ
      if (kind === 'period_closed') {
        items.push({
          ...base,
          userId: r.userId,
          title: `Đã chốt sổ tháng ${month}`,
          body: `Tổng chi ${amountText(period.result.grandTotal)}. Cả nhà đã nhận phiếu, hạn đóng ${dayMonth(period.dueDate)}.`,
          url: `/hoa-don?ky=${periodId}`,
        })
      }
      continue
    }

    const owes = slip.due < 0
    const amount = amountText(Math.abs(slip.due))
    const url = `/phieu/${periodId}`
    if (kind === 'period_closed') {
      items.push({
        ...base,
        userId: r.userId,
        title: owes
          ? `Tháng ${month}: chủ nhà cần trả lại bạn ${amount}`
          : slip.due === 0
            ? `Tháng ${month}: bạn không cần chuyển khoản nào`
            : `Tháng ${month}: bạn cần chuyển ${amount}`,
        body: owes ? 'Mở phiếu để xem chi tiết.' : `Hạn đóng ${dayMonth(period.dueDate)}. Mở phiếu để xem chi tiết và mã QR.`,
        url,
      })
    } else {
      items.push({
        ...base,
        userId: r.userId,
        title: `Phiếu tháng ${month} đã cập nhật`,
        body: owes ? `Chủ nhà cần trả lại bạn ${amount}` : slip.due === 0 ? 'Bạn không cần chuyển khoản nào.' : `Số cần chuyển hiện là ${amount}.`,
        url,
      })
    }
  }
  await deliver(db, send, items)
}
