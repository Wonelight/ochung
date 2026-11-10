'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { remindMember } from '@/server/notifications'
import { getPushSender } from '@/server/push'
import { confirmPayment, recordCashPayment, recordRefund, rejectPayment, submitTransfer } from '@/server/payments'

// Số liệu thanh toán hiện ở Trang chủ, Hóa đơn và Phiếu nên làm mới cả layout sau mỗi thay đổi.
const refresh = () => revalidatePath('/', 'layout')

/** Thành viên báo "Tôi đã chuyển" cho chính mình; số tiền luôn do server tính. */
export async function submitTransferAction(periodId: string, input: { proofUrl?: string }) {
  return runAction(async () => {
    const actor = await getActor()
    const res = await submitTransfer(db, actor, periodId, { proofUrl: typeof input?.proofUrl === 'string' ? input.proofUrl : undefined })
    refresh()
    return res
  })
}

export async function confirmPaymentAction(paymentId: string) {
  return runAction(async () => {
    await confirmPayment(db, await getActor(), paymentId)
    refresh()
  })
}

export async function rejectPaymentAction(paymentId: string, reason: string) {
  return runAction(async () => {
    await rejectPayment(db, await getActor(), paymentId, String(reason ?? ''))
    refresh()
  })
}

export async function recordCashPaymentAction(periodId: string, memberId: string, amount: number) {
  return runAction(async () => {
    await recordCashPayment(db, await getActor(), periodId, memberId, amount)
    refresh()
  })
}

export async function recordRefundAction(periodId: string, memberId: string, amount: number) {
  return runAction(async () => {
    await recordRefund(db, await getActor(), periodId, memberId, amount)
    refresh()
  })
}

/** Chủ nhà bấm "Nhắc" một người còn nợ: thông báo trong app + web push; tối đa 1 lần mỗi 10 phút cho mỗi người mỗi tháng. */
export async function remindMemberAction(periodId: string, memberId: string) {
  return runAction(async () => {
    await remindMember(db, getPushSender(), await getActor(), periodId, memberId)
  })
}
