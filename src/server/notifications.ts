import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { houseMembers, houses, joinRequests, notifications, payments, periods, pushSubscriptions, user } from '@/db/schema'
import { paymentStatus } from '@/lib/billing/status'
import type { PaymentRecord } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { formatVnd } from '@/lib/money'
import type { Actor } from './actor'
import { requireOwner, type Tx } from './houses'
import { getStatuses } from './payments'
import type { PushSender } from './period-events'

export type NotificationKind =
  | 'period_closed'
  | 'period_updated'
  | 'owner_message'
  | 'reminder'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'transfer_submitted'
  | 'payment_rejected'

/** Spec §8: web push CHỈ cho chốt sổ, cập nhật sau chốt và tin chủ nhà tự gửi/nhắc. Mọi loại khác chỉ vào chuông. */
const PUSH_KINDS: ReadonlySet<NotificationKind> = new Set(['period_closed', 'period_updated', 'owner_message', 'reminder'])

const MESSAGE_MAX = 200
const REMIND_COOLDOWN_MINUTES = 10
const LIST_LIMIT = 50

export type NotifyInput = {
  userIds: string[]
  houseId: string | null
  kind: NotificationKind
  title: string
  body: string
  url: string
  push: boolean
}

/** Một thông báo cho đúng một người (tiêu đề/nội dung có thể khác nhau theo người, ví dụ số tiền của riêng họ). */
export type DeliveryItem = Omit<NotifyInput, 'userIds'> & { userId: string }

type Writer = Db | Tx

async function insertItems(w: Writer, items: DeliveryItem[]): Promise<void> {
  if (items.length === 0) return
  await w.insert(notifications).values(
    items.map((i) => ({ id: newId(), userId: i.userId, houseId: i.houseId, kind: i.kind, title: i.title, body: i.body, url: i.url })),
  )
}

/** Gửi push tới mọi subscription của các người nhận; 'gone' → xóa subscription. Không bao giờ ném lỗi. */
async function pushItems(db: Db, send: PushSender, items: DeliveryItem[]): Promise<void> {
  const pushable = items.filter((i) => i.push && PUSH_KINDS.has(i.kind))
  if (pushable.length === 0) return
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(pushable.map((i) => i.userId))]))
  const gone: string[] = []
  await Promise.all(
    pushable.flatMap((item) =>
      subs
        .filter((s) => s.userId === item.userId)
        .map(async (sub) => {
          try {
            const res = await send(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
              { title: item.title, body: item.body, url: item.url },
            )
            if (res === 'gone') gone.push(sub.endpoint)
          } catch (e) {
            console.error('Gửi web push thất bại', e)
          }
        }),
    ),
  )
  if (gone.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone))
}

/** Ghi thông báo trong app cho từng mục rồi gửi push cho các mục có `push` (chỉ loại được phép). Lỗi ghi DB thì ném. */
export async function deliver(db: Db, send: PushSender, items: DeliveryItem[]): Promise<void> {
  await insertItems(db, items)
  await pushItems(db, send, items)
}

/** Cùng một nội dung cho nhiều người. 'gone' (404/410) từ dịch vụ push → xóa subscription đó. */
export async function notify(db: Db, send: PushSender, n: NotifyInput): Promise<void> {
  const { userIds, ...rest } = n
  await deliver(db, send, [...new Set(userIds)].map((userId) => ({ ...rest, userId })))
}

/** Chạy một bước thông báo SAU khi dữ liệu chính đã commit: lỗi chỉ được ghi log, không bao giờ nổi lên thành "lưu thất bại". */
export async function afterCommit(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    console.error(`${label} thất bại`, e)
  }
}

// ───────────────────────── Thông báo trong app từ vào nhà và thanh toán (không gửi đẩy) ─────────────────────────

/** Có người xin vào nhà bằng mã nhà → chủ nhà. */
export async function notifyJoinRequested(db: Db, requestId: string): Promise<void> {
  const [row] = await db
    .select({ houseId: houses.id, houseName: houses.name, ownerId: houses.ownerUserId, name: user.name })
    .from(joinRequests)
    .innerJoin(houses, eq(houses.id, joinRequests.houseId))
    .innerJoin(user, eq(user.id, joinRequests.userId))
    .where(eq(joinRequests.id, requestId))
    .limit(1)
  if (!row) return
  await insertItems(db, [
    {
      userId: row.ownerId,
      houseId: row.houseId,
      kind: 'join_request',
      title: `${row.name} xin vào nhà ${row.houseName}`,
      body: 'Mở Quản lý nhà để duyệt hoặc từ chối.',
      url: '/nha',
      push: false,
    },
  ])
}

/** Chủ nhà duyệt/từ chối → người xin vào. */
export async function notifyJoinDecided(db: Db, requestId: string, decision: 'approve' | 'reject'): Promise<void> {
  const [row] = await db
    .select({ houseId: houses.id, houseName: houses.name, userId: joinRequests.userId })
    .from(joinRequests)
    .innerJoin(houses, eq(houses.id, joinRequests.houseId))
    .where(eq(joinRequests.id, requestId))
    .limit(1)
  if (!row) return
  const approved = decision === 'approve'
  await insertItems(db, [
    {
      userId: row.userId,
      houseId: row.houseId,
      kind: approved ? 'join_approved' : 'join_rejected',
      title: approved ? `Bạn đã được vào nhà ${row.houseName}` : `Yêu cầu vào nhà ${row.houseName} bị từ chối`,
      body: approved ? 'Mở app để xem hóa đơn của nhà.' : 'Hãy hỏi lại chủ nhà nếu bạn nghĩ đây là nhầm lẫn.',
      url: '/',
      push: false,
    },
  ])
}

type PaymentContext = {
  houseId: string
  periodId: string
  month: number
  amount: number
  memberUserId: string
  memberName: string
  ownerUserId: string
  rejectReason: string | null
}

async function loadPaymentContext(db: Db, paymentId: string): Promise<PaymentContext | null> {
  const [row] = await db
    .select({
      houseId: periods.houseId,
      periodId: periods.id,
      month: periods.month,
      amount: payments.amount,
      memberUserId: houseMembers.userId,
      memberName: user.name,
      ownerUserId: houses.ownerUserId,
      rejectReason: payments.rejectReason,
    })
    .from(payments)
    .innerJoin(periods, eq(periods.id, payments.periodId))
    .innerJoin(houseMembers, eq(houseMembers.id, payments.memberId))
    .innerJoin(user, eq(user.id, houseMembers.userId))
    .innerJoin(houses, eq(houses.id, periods.houseId))
    .where(eq(payments.id, paymentId))
    .limit(1)
  return row ?? null
}

/** Thành viên báo "Tôi đã chuyển" → chủ nhà. */
export async function notifyTransferSubmitted(db: Db, paymentId: string): Promise<void> {
  const c = await loadPaymentContext(db, paymentId)
  if (!c) return
  await insertItems(db, [
    {
      userId: c.ownerUserId,
      houseId: c.houseId,
      kind: 'transfer_submitted',
      title: `${c.memberName} báo đã chuyển ${formatVnd(c.amount)}đ`,
      body: `Tháng ${c.month}: mở Hóa đơn để xác nhận hoặc từ chối.`,
      url: `/hoa-don?ky=${c.periodId}`,
      push: false,
    },
  ])
}

/** Chủ nhà từ chối khoản chuyển → thành viên đó. */
export async function notifyPaymentRejected(db: Db, paymentId: string): Promise<void> {
  const c = await loadPaymentContext(db, paymentId)
  if (!c) return
  await insertItems(db, [
    {
      userId: c.memberUserId,
      houseId: c.houseId,
      kind: 'payment_rejected',
      title: `Chủ nhà chưa xác nhận khoản chuyển tháng ${c.month}`,
      body: c.rejectReason ? `Lý do: ${c.rejectReason}` : 'Mở phiếu để xem chi tiết.',
      url: `/phieu/${c.periodId}`,
      push: false,
    },
  ])
}

// ───────────────────────── Chủ nhà tự gửi ─────────────────────────

/**
 * Chủ nhà gửi một tin cho cả nhà (audience 'all') hoặc cho người chưa đóng đủ (audience 'unpaid': trạng thái unpaid/partial/pending
 * của tháng đã chốt gần nhất). Người nhận là thành viên đang ở trong nhà, không gồm chủ nhà. Có gửi push.
 */
export async function sendHouseMessage(
  db: Db,
  send: PushSender,
  actor: Actor,
  houseId: string,
  input: { body: string; audience: 'all' | 'unpaid' },
): Promise<{ recipients: number }> {
  await requireOwner(db, actor, houseId)
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (body.length < 1 || body.length > MESSAGE_MAX) {
    throw new AppError('INVALID', 'MESSAGE_INVALID', `Tin nhắn gồm 1–${MESSAGE_MAX} ký tự`)
  }
  if (input.audience !== 'all' && input.audience !== 'unpaid') {
    throw new AppError('INVALID', 'AUDIENCE_INVALID', 'Chưa chọn người nhận')
  }
  const [house] = await db.select({ name: houses.name }).from(houses).where(eq(houses.id, houseId)).limit(1)
  const members = await db
    .select({ id: houseMembers.id, userId: houseMembers.userId })
    .from(houseMembers)
    .where(and(eq(houseMembers.houseId, houseId), eq(houseMembers.role, 'member'), isNull(houseMembers.leftAt)))

  let targets = members
  if (input.audience === 'unpaid') {
    const [latest] = await db
      .select({ id: periods.id })
      .from(periods)
      .where(and(eq(periods.houseId, houseId), eq(periods.status, 'closed')))
      .orderBy(desc(periods.year), desc(periods.month))
      .limit(1)
    const statuses = latest ? await getStatuses(db, latest.id) : {}
    const owing = new Set(['unpaid', 'partial', 'pending'])
    targets = members.filter((m) => {
      const s = statuses[m.id]
      return s !== undefined && owing.has(s.kind)
    })
  }

  await notify(db, send, {
    userIds: targets.map((m) => m.userId),
    houseId,
    kind: 'owner_message',
    title: `Tin từ chủ nhà · ${house?.name ?? ''}`.trim(),
    body,
    url: '/thong-bao',
    push: true,
  })
  return { recipients: targets.length }
}

/**
 * Chủ nhà bấm "Nhắc" một người còn nợ ở tháng đã chốt (memberId = dòng house_members). Chỉ khi số dư > 0.
 * Tối đa một lần nhắc cho mỗi người mỗi tháng trong 10 phút (CONFLICT REMIND_TOO_SOON); kiểm và ghi trong transaction
 * giữ khóa dòng tháng nên hai cú bấm cùng lúc chỉ một cú thắng. Push gửi sau khi commit.
 */
export async function remindMember(db: Db, send: PushSender, actor: Actor, periodId: string, memberId: string): Promise<void> {
  const item = await db.transaction(async (tx): Promise<DeliveryItem> => {
    const [period] = await tx.select().from(periods).where(eq(periods.id, periodId)).for('no key update').limit(1)
    if (!period) throw new AppError('NOT_FOUND', 'PERIOD_NOT_FOUND', 'Không tìm thấy tháng này')
    await requireOwner(tx, actor, period.houseId)
    if (period.status !== 'closed') {
      throw new AppError('INVALID', 'PERIOD_NOT_CLOSED', 'Tháng này chưa chốt sổ nên chưa nhắc được')
    }
    const slip = period.result?.payslips.find((p) => p.memberId === memberId)
    if (!slip || slip.due === null) {
      throw new AppError('NOT_FOUND', 'PAYSLIP_NOT_FOUND', 'Người này không có phiếu thanh toán trong tháng này')
    }
    const records: PaymentRecord[] = await tx
      .select({ direction: payments.direction, amount: payments.amount, status: payments.status })
      .from(payments)
      .where(and(eq(payments.periodId, periodId), eq(payments.memberId, memberId)))
    const { balance } = paymentStatus(slip.due, records)
    if (balance <= 0) throw new AppError('CONFLICT', 'NOTHING_DUE', 'Người này không còn khoản nào cần đóng')

    const [target] = await tx.select({ userId: houseMembers.userId }).from(houseMembers).where(eq(houseMembers.id, memberId)).limit(1)
    if (!target) throw new AppError('NOT_FOUND', 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên này')
    const url = `/phieu/${periodId}`
    const recent = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, target.userId),
          eq(notifications.kind, 'reminder'),
          eq(notifications.url, url),
          gt(notifications.createdAt, sql`now() - make_interval(mins => ${REMIND_COOLDOWN_MINUTES})`),
        ),
      )
      .limit(1)
    if (recent.length > 0) {
      throw new AppError('CONFLICT', 'REMIND_TOO_SOON', `Vừa nhắc người này rồi, hãy thử lại sau ${REMIND_COOLDOWN_MINUTES} phút`)
    }
    const next: DeliveryItem = {
      userId: target.userId,
      houseId: period.houseId,
      kind: 'reminder',
      title: `Nhắc đóng tiền tháng ${period.month}: ${formatVnd(balance)}đ`,
      body: 'Mở phiếu để xem chi tiết và mã QR chuyển khoản.',
      url,
      push: true,
    }
    await insertItems(tx, [next])
    return next
  })
  await pushItems(db, send, [item])
}

// ───────────────────────── Chuông ─────────────────────────

export type NotificationItem = {
  id: string
  kind: string
  title: string
  body: string
  url: string
  houseId: string | null
  readAt: Date | null
  createdAt: Date
}

/** Thông báo của chính người gọi, mới nhất trước (tối đa 50). */
export async function listNotifications(db: Db, actor: Actor): Promise<NotificationItem[]> {
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      houseId: notifications.houseId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(LIST_LIMIT)
}

export async function markAllRead(db: Db, actor: Actor): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)))
}

export async function unreadCount(db: Db, actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)))
  return row?.n ?? 0
}

// ───────────────────────── Đăng ký push ─────────────────────────

// Server sẽ POST tới endpoint này, nên chỉ nhận máy chủ push của các trình duyệt (tránh dùng làm bàn đạp gọi địa chỉ tùy ý).
const PUSH_HOST_SUFFIXES = ['push.apple.com', 'fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com']
const FIELD_MAX = 600

function isPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string }

/** Lưu subscription của thiết bị này cho người gọi. Cùng endpoint thì cập nhật (kể cả khi máy đổi người đăng nhập). */
export async function savePushSubscription(db: Db, actor: Actor, input: PushSubscriptionInput): Promise<void> {
  const { endpoint, p256dh, auth } = input
  const ok = [endpoint, p256dh, auth].every((v) => typeof v === 'string' && v.length > 0 && v.length <= FIELD_MAX)
  if (!ok || !isPushEndpoint(endpoint)) {
    throw new AppError('INVALID', 'PUSH_SUBSCRIPTION', 'Thông tin đăng ký thông báo không hợp lệ')
  }
  await db
    .insert(pushSubscriptions)
    .values({ id: newId(), userId: actor.userId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: actor.userId, p256dh, auth } })
}

/** Xóa subscription của chính người gọi (không đụng subscription của người khác). */
export async function removePushSubscription(db: Db, actor: Actor, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, actor.userId), eq(pushSubscriptions.endpoint, endpoint)))
}
