'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import type { PeriodResult, YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import type { PeriodEdits } from '@/lib/period-edits'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { addExpense, deleteExpense, updateExpense, type ExpensePatch } from '@/server/expenses'
import { applyPeriodEdits, closePeriod, previewPeriod } from '@/server/periods'

// Lớp vỏ mỏng: getActor → hàm server (tự kiểm quyền chủ nhà) → lỗi nghiệp vụ thành câu tiếng Việt (runAction).
const refreshApp = () => revalidatePath('/', 'layout')

/**
 * Tháng nháp: lưu các trường vừa đổi rồi tính thử lại từ DB (`previewPeriod`). Số liệu đã lưu dù tháng chưa tính được
 * (ví dụ chưa ai được tính): khi đó trả `problem` để màn hình hiện lỗi ngay dưới số tổng.
 * Chỉ ghi vào tháng còn nháp (`expect: 'draft'`); tháng vừa bị chốt ở nơi khác → `closedElsewhere` để màn hình ngừng lưu tự động.
 */
export async function saveDraftAction(periodId: string, edits: PeriodEdits | null) {
  return runAction(async (): Promise<{ result: PeriodResult | null; problem: string | null; closedElsewhere?: string }> => {
    const actor = await getActor()
    if (edits) {
      try {
        await applyPeriodEdits(db, actor, periodId, edits, { expect: 'draft' })
      } catch (e) {
        if (e instanceof AppError && e.reason === 'PERIOD_CLOSED') return { result: null, problem: null, closedElsewhere: e.message }
        throw e
      }
    }
    try {
      return { result: await previewPeriod(db, actor, periodId), problem: null }
    } catch (e) {
      if (e instanceof AppError && e.code === 'INVALID') return { result: null, problem: e.message }
      throw e
    }
  })
}

/** "Tạo & gửi hóa đơn": chốt sổ tháng nháp. */
export async function closePeriodAction(periodId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await closePeriod(db, actor, periodId)
    refreshApp()
  })
}

/** "Cập nhật" tháng đã chốt: mọi thay đổi trong một lần sửa (revision +1, báo cả nhà một lần). */
export async function updateClosedPeriodAction(periodId: string, edits: PeriodEdits) {
  return runAction(async () => {
    const actor = await getActor()
    await applyPeriodEdits(db, actor, periodId, edits)
    refreshApp()
  })
}

export async function addExpenseAction(
  houseId: string,
  input: { description: string; amount: number; spentOn: string; paidByMemberId: string },
) {
  return runAction(async (): Promise<{ ym: YM; movedFromClosed: boolean }> => {
    const actor = await getActor()
    const { ym, movedFromClosed } = await addExpense(db, actor, houseId, input)
    refreshApp()
    return { ym, movedFromClosed }
  })
}

export async function updateExpenseAction(expenseId: string, patch: ExpensePatch) {
  return runAction(async () => {
    const actor = await getActor()
    await updateExpense(db, actor, expenseId, patch)
    refreshApp()
  })
}

export async function deleteExpenseAction(expenseId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await deleteExpense(db, actor, expenseId)
    refreshApp()
  })
}
