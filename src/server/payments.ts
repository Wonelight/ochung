import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { houses, payments, periods } from '@/db/schema'
import { paymentStatus } from '@/lib/billing/status'
import type { PaymentRecord, PaymentStatus, Payslip } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { statusesFor } from '@/lib/payments-view'
import { isProofUrlFor } from '@/lib/proof'
import { MAX_MONEY } from '@/lib/validation'
import type { Actor } from './actor'
import { isUniqueViolation, requireOwner, requirePeriodViewer, type Tx } from './houses'
import { afterCommit, notifyPaymentRejected, notifyTransferSubmitted } from './notifications'

// Mỗi lần trả là một bản ghi riêng; trạng thái của một phiếu luôn được TÍNH từ các bản ghi (xem paymentStatus), không lưu tay.
//
// Khóa (tránh đua): các thao tác tạo bản ghi (báo chuyển, ghi tiền mặt, trả lại) khóa dòng tháng FOR NO KEY UPDATE rồi mới
// đọc số dư, nên số dư không đổi giữa lúc đọc và lúc ghi. Duyệt/từ chối khóa dòng bản ghi FOR UPDATE. Khóa NO KEY UPDATE
// không chặn khóa KEY SHARE của khóa ngoại khi chèn bản ghi (cùng quy ước với periods.ts).

const REASON_MAX = 200

type PeriodRow = typeof periods.$inferSelect
type PaymentRow = typeof payments.$inferSelect

const paymentNotFound = () => new AppError('NOT_FOUND', 'PAYMENT_NOT_FOUND', 'Không tìm thấy khoản thanh toán này')
const notClosed = () => new AppError('INVALID', 'PERIOD_NOT_CLOSED', 'Tháng này chưa chốt sổ nên chưa thanh toán được')
const decided = () => new AppError('CONFLICT', 'PAYMENT_DECIDED', 'Khoản này đã được xử lý rồi')

async function lockPeriod(tx: Tx, periodId: string): Promise<PeriodRow> {
  const [row] = await tx.select().from(periods).where(eq(periods.id, periodId)).for('no key update').limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'PERIOD_NOT_FOUND', 'Không tìm thấy tháng này')
  return row
}

/** Phiếu phải chuyển của một người trong tháng đã chốt; undefined nếu không có (chủ nhà, người không được tính tháng này). */
function payslipOf(period: PeriodRow, memberId: string): (Payslip & { due: number }) | undefined {
  const slip = period.result?.payslips.find((p) => p.memberId === memberId)
  return slip && slip.due !== null ? (slip as Payslip & { due: number }) : undefined
}

const toRecord = (r: Pick<PaymentRow, 'direction' | 'amount' | 'status'>): PaymentRecord => ({
  direction: r.direction,
  amount: r.amount,
  status: r.status,
})

async function recordsOfMember(db: Db, periodId: string, memberId: string): Promise<PaymentRow[]> {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.periodId, periodId), eq(payments.memberId, memberId)))
    .orderBy(asc(payments.createdAt))
}

function cleanAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MONEY) {
    throw new AppError('INVALID', 'AMOUNT_INVALID', 'Số tiền phải là số nguyên đồng lớn hơn 0')
  }
  return amount
}

/** Bản ghi thanh toán theo từng người của một tháng. */
async function recordsByMember(db: Db, periodId: string): Promise<Record<string, PaymentRecord[]>> {
  const rows = await db
    .select({ memberId: payments.memberId, direction: payments.direction, amount: payments.amount, status: payments.status })
    .from(payments)
    .where(eq(payments.periodId, periodId))
  const out: Record<string, PaymentRecord[]> = {}
  for (const r of rows) (out[r.memberId] ??= []).push(toRecord(r))
  return out
}

/**
 * Trạng thái thanh toán của từng người trong một tháng ĐÃ CHỐT (memberId → trạng thái; chủ nhà không có).
 * Tháng nháp hoặc không có → {}. KHÔNG kiểm quyền: chỉ gọi từ mã phía server sau khi đã kiểm quyền xem tháng
 * (getPeriodView / listPeriods); không được xuất làm server action.
 */
export async function getStatuses(db: Db, periodId: string): Promise<Record<string, PaymentStatus>> {
  const [row] = await db.select({ status: periods.status, result: periods.result }).from(periods).where(eq(periods.id, periodId)).limit(1)
  if (!row || row.status !== 'closed' || !row.result) return {}
  return statusesFor(row.result.payslips, await recordsByMember(db, periodId))
}

/**
 * Còn người có số dư ≠ 0 (còn nợ, hoặc chủ nhà còn phải trả lại) ở bất kỳ tháng ĐÃ CHỐT nào của nhà?
 * `memberId` thu hẹp vào một người. Dùng chung định nghĩa số dư của paymentStatus; hai truy vấn bất kể số tháng.
 */
export async function hasOutstandingBalance(db: Db, houseId: string, memberId?: string): Promise<boolean> {
  const closedPeriods = await db
    .select({ id: periods.id, result: periods.result })
    .from(periods)
    .where(and(eq(periods.houseId, houseId), eq(periods.status, 'closed')))
  if (closedPeriods.length === 0) return false
  const rows = await db
    .select({ periodId: payments.periodId, memberId: payments.memberId, direction: payments.direction, amount: payments.amount, status: payments.status })
    .from(payments)
    .where(inArray(payments.periodId, closedPeriods.map((p) => p.id)))
  const byKey = new Map<string, PaymentRecord[]>()
  for (const r of rows) {
    const key = `${r.periodId}:${r.memberId}`
    const list = byKey.get(key)
    if (list) list.push(toRecord(r))
    else byKey.set(key, [toRecord(r)])
  }
  for (const period of closedPeriods) {
    for (const slip of period.result?.payslips ?? []) {
      if (slip.due === null || (memberId !== undefined && slip.memberId !== memberId)) continue
      if (paymentStatus(slip.due, byKey.get(`${period.id}:${slip.memberId}`) ?? []).balance !== 0) return true
    }
  }
  return false
}

export type PaymentDetail = {
  id: string
  memberId: string
  direction: 'in' | 'out'
  amount: number
  status: 'pending' | 'confirmed' | 'rejected'
  proofUrl: string | null
  rejectReason: string | null
  createdAt: Date
}

/**
 * Chi tiết các bản ghi của một tháng đã chốt, mới nhất trước. Chủ nhà thấy của mọi người; thành viên (cả người đã rời, với tháng
 * đã chốt có tên mình) chỉ thấy bản ghi của mình (ảnh chứng từ chỉ trả cho người trong nhà, và thành viên không xem ảnh của người khác).
 */
export async function getPaymentDetails(db: Db, actor: Actor, periodId: string): Promise<PaymentDetail[]> {
  const [period] = await db
    .select({ id: periods.id, houseId: periods.houseId, status: periods.status })
    .from(periods)
    .where(eq(periods.id, periodId))
    .limit(1)
  if (!period) throw new AppError('NOT_FOUND', 'PERIOD_NOT_FOUND', 'Không tìm thấy tháng này')
  const me = await requirePeriodViewer(db, actor, period)
  const rows = await db
    .select()
    .from(payments)
    .where(me.role === 'owner' ? eq(payments.periodId, periodId) : and(eq(payments.periodId, periodId), eq(payments.memberId, me.memberId)))
    .orderBy(asc(payments.createdAt))
  return rows
    .map((r) => ({
      id: r.id,
      memberId: r.memberId,
      direction: r.direction,
      amount: r.amount,
      status: r.status,
      proofUrl: r.proofUrl,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    }))
    .reverse()
}

/**
 * Kiểm quyền tải ảnh chứng từ lên: người gọi là thành viên đang ở trong nhà, hoặc người đã rời có tên trong tháng
 * (không phải nhà đã lưu trữ), tháng đã chốt. Trả nhà và dòng thành viên của chính người gọi để đặt đường dẫn ảnh;
 * route `/api/upload` dùng hàm này.
 */
export async function authorizeProofUpload(db: Db, actor: Actor, periodId: string): Promise<{ houseId: string; memberId: string }> {
  const [period] = await db
    .select({ id: periods.id, houseId: periods.houseId, status: periods.status })
    .from(periods)
    .where(eq(periods.id, periodId))
    .limit(1)
  if (!period) throw new AppError('NOT_FOUND', 'PERIOD_NOT_FOUND', 'Không tìm thấy tháng này')
  const me = await requirePeriodViewer(db, actor, period)
  const [house] = await db.select({ archivedAt: houses.archivedAt }).from(houses).where(eq(houses.id, period.houseId)).limit(1)
  if (house?.archivedAt) throw new AppError('FORBIDDEN', 'HOUSE_ARCHIVED', 'Nhà đã được lưu trữ, chỉ xem được')
  if (period.status !== 'closed') throw notClosed()
  return { houseId: period.houseId, memberId: me.memberId }
}

/**
 * Thành viên báo "Tôi đã chuyển": tạo bản ghi `in` đang chờ, số tiền = số còn phải trả hiện tại.
 * Luôn dùng dòng thành viên của chính người gọi. Đã có bản ghi chờ thì trả lại bản ghi đó (gọi lại không tạo thêm).
 * Người đã rời nhà vẫn báo chuyển được cho tháng đã chốt có tên mình mà còn nợ (để trả nốt); ngoài ra họ không ghi được gì.
 */
export async function submitTransfer(
  db: Db,
  actor: Actor,
  periodId: string,
  input: { proofUrl?: string },
): Promise<{ paymentId: string }> {
  const proofUrl = input.proofUrl?.trim() || null
  const { paymentId, created } = await db.transaction(async (tx) => {
    const period = await lockPeriod(tx, periodId)
    const me = await requirePeriodViewer(tx, actor, period)
    const [house] = await tx.select({ archivedAt: houses.archivedAt }).from(houses).where(eq(houses.id, period.houseId)).limit(1)
    if (house?.archivedAt) throw new AppError('FORBIDDEN', 'HOUSE_ARCHIVED', 'Nhà đã được lưu trữ, chỉ xem được')
    if (period.status !== 'closed') throw notClosed()
    if (proofUrl && !isProofUrlFor(proofUrl, period.houseId, periodId, me.memberId)) {
      throw new AppError('INVALID', 'PROOF_URL', 'Ảnh chứng từ không hợp lệ')
    }

    const mine = await recordsOfMember(tx, periodId, me.memberId)
    const pending = mine.find((r) => r.direction === 'in' && r.status === 'pending')
    if (pending) return { paymentId: pending.id, created: false }

    const slip = payslipOf(period, me.memberId)
    const balance = slip ? paymentStatus(slip.due, mine.map(toRecord)).balance : 0
    if (balance <= 0) throw new AppError('CONFLICT', 'NOTHING_DUE', 'Bạn không còn khoản nào cần chuyển trong tháng này')

    const id = newId()
    try {
      // Điểm lưu riêng: vi phạm chỉ mục duy nhất (một khoản chờ cho mỗi người mỗi tháng) không làm hỏng cả transaction.
      await tx.transaction((sp) =>
        sp.insert(payments).values({ id, periodId, memberId: me.memberId, direction: 'in', amount: balance, proofUrl, createdBy: actor.userId }),
      )
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      const [existing] = (await recordsOfMember(tx, periodId, me.memberId)).filter((r) => r.direction === 'in' && r.status === 'pending')
      if (!existing) throw e
      return { paymentId: existing.id, created: false }
    }
    return { paymentId: id, created: true }
  })
  // chỉ khi tạo khoản mới: gọi lại lúc đã có khoản chờ không báo thêm cho chủ nhà
  if (created) await afterCommit('Thông báo báo chuyển khoản', () => notifyTransferSubmitted(db, paymentId))
  return { paymentId }
}

/** Chủ nhà của tháng chứa bản ghi quyết định; khóa dòng bản ghi và trả bản ghi đã khóa. */
async function lockPaymentAsOwner(tx: Tx, actor: Actor, paymentId: string): Promise<PaymentRow> {
  const [pay] = await tx.select({ periodId: payments.periodId }).from(payments).where(eq(payments.id, paymentId)).limit(1)
  if (!pay) throw paymentNotFound()
  const [period] = await tx.select({ houseId: periods.houseId }).from(periods).where(eq(periods.id, pay.periodId)).limit(1)
  if (!period) throw paymentNotFound()
  await requireOwner(tx, actor, period.houseId)
  const [locked] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update').limit(1)
  if (!locked) throw paymentNotFound()
  return locked
}

/** Chủ nhà xác nhận đã nhận tiền. Đã xác nhận rồi thì không làm gì; đã bị từ chối → CONFLICT. */
export async function confirmPayment(db: Db, actor: Actor, paymentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const pay = await lockPaymentAsOwner(tx, actor, paymentId)
    if (pay.status === 'confirmed') return
    if (pay.status !== 'pending') throw decided()
    await tx.update(payments).set({ status: 'confirmed', decidedAt: new Date(), decidedBy: actor.userId }).where(eq(payments.id, paymentId))
  })
}

/** Chủ nhà từ chối kèm lý do (1–200 ký tự). Đã từ chối rồi thì không làm gì; đã xác nhận → CONFLICT. */
export async function rejectPayment(db: Db, actor: Actor, paymentId: string, reason: string): Promise<void> {
  const cleaned = reason.trim()
  if (cleaned.length < 1 || cleaned.length > REASON_MAX) {
    throw new AppError('INVALID', 'REASON_INVALID', `Lý do từ chối gồm 1–${REASON_MAX} ký tự`)
  }
  const changed = await db.transaction(async (tx) => {
    const pay = await lockPaymentAsOwner(tx, actor, paymentId)
    if (pay.status === 'rejected') return false
    if (pay.status !== 'pending') throw decided()
    await tx
      .update(payments)
      .set({ status: 'rejected', rejectReason: cleaned, decidedAt: new Date(), decidedBy: actor.userId })
      .where(eq(payments.id, paymentId))
    return true
  })
  if (changed) await afterCommit('Thông báo từ chối khoản chuyển', () => notifyPaymentRejected(db, paymentId))
}

/** Ghi trực tiếp một khoản đã xác nhận (tiền mặt: thành viên → chủ nhà; trả lại: chủ nhà → thành viên). */
async function recordDirect(
  db: Db,
  actor: Actor,
  periodId: string,
  memberId: string,
  amount: number,
  direction: 'in' | 'out',
): Promise<void> {
  await db.transaction(async (tx) => {
    const period = await lockPeriod(tx, periodId)
    await requireOwner(tx, actor, period.houseId)
    if (period.status !== 'closed') throw notClosed()
    const cleaned = cleanAmount(amount)
    const slip = payslipOf(period, memberId)
    if (!slip) throw new AppError('NOT_FOUND', 'PAYSLIP_NOT_FOUND', 'Người này không có phiếu thanh toán trong tháng này')
    const mine = await recordsOfMember(tx, periodId, memberId)
    const { balance } = paymentStatus(slip.due, mine.map(toRecord))
    if (direction === 'in') {
      if (mine.some((r) => r.direction === 'in' && r.status === 'pending')) {
        throw new AppError('CONFLICT', 'HAS_PENDING', 'Đang có khoản chờ xác nhận. Hãy xác nhận hoặc từ chối khoản đó trước')
      }
      if (balance <= 0 || cleaned > balance) {
        throw new AppError('INVALID', 'AMOUNT_EXCEEDS', 'Số tiền vượt quá số người này còn phải trả')
      }
    } else if (balance >= 0 || cleaned > -balance) {
      throw new AppError('INVALID', 'AMOUNT_EXCEEDS', 'Số tiền vượt quá số chủ nhà còn phải trả lại')
    }
    const now = new Date()
    await tx.insert(payments).values({
      id: newId(),
      periodId,
      memberId,
      direction,
      amount: cleaned,
      status: 'confirmed',
      createdBy: actor.userId,
      decidedAt: now,
      decidedBy: actor.userId,
    })
  })
}

/** Chủ nhà đánh dấu đã nhận tiền mặt: tạo bản ghi `in` đã xác nhận, tối đa bằng số còn thiếu. */
export async function recordCashPayment(db: Db, actor: Actor, periodId: string, memberId: string, amount: number): Promise<void> {
  await recordDirect(db, actor, periodId, memberId, amount, 'in')
}

/** Chủ nhà "Đã trả lại": tạo bản ghi `out` đã xác nhận, chỉ khi chủ nhà đang nợ người đó và tối đa bằng số nợ. */
export async function recordRefund(db: Db, actor: Actor, periodId: string, memberId: string, amount: number): Promise<void> {
  await recordDirect(db, actor, periodId, memberId, amount, 'out')
}
