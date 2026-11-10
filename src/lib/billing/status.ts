import { AppError } from '@/lib/errors'
import type { PaymentRecord, PaymentStatus } from './types'

/**
 * Trạng thái thanh toán của một phiếu. balance = due − confirmedIn + confirmedOut.
 * Bản ghi `rejected` bị bỏ qua; `out` chỉ tính khi đã `confirmed`.
 * balance < 0 → owner_owes; = 0 → paid; > 0: còn `in` đang chờ → pending,
 * đã nhận một phần → partial, chưa có gì → unpaid.
 */
export function paymentStatus(due: number, records: PaymentRecord[]): PaymentStatus {
  if (!Number.isSafeInteger(due)) {
    throw new AppError('INVALID', 'AMOUNT_INVALID', 'Số tiền phải là số nguyên đồng')
  }

  let confirmedIn = 0
  let confirmedOut = 0
  let hasPendingIn = false
  for (const r of records) {
    if (!Number.isSafeInteger(r.amount) || r.amount < 0) {
      throw new AppError('INVALID', 'AMOUNT_INVALID', 'Số tiền phải là số nguyên đồng, không âm')
    }
    if (r.status === 'rejected') continue
    if (r.direction === 'in') {
      if (r.status === 'confirmed') confirmedIn += r.amount
      else hasPendingIn = true
    } else if (r.status === 'confirmed') {
      confirmedOut += r.amount
    }
  }

  const balance = due - confirmedIn + confirmedOut
  let kind: PaymentStatus['kind']
  if (balance < 0) kind = 'owner_owes'
  else if (balance === 0) kind = 'paid'
  else if (hasPendingIn) kind = 'pending'
  else if (confirmedIn > 0) kind = 'partial'
  else kind = 'unpaid'

  return { kind, balance, confirmedIn, confirmedOut }
}
