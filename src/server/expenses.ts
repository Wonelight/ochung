import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { expenses, periodMembers, periods } from '@/db/schema'
import { daysInMonth, resolveExpenseMonth } from '@/lib/billing/period-month'
import type { YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { MAX_MONEY } from '@/lib/validation'
import type { Actor } from './actor'
import { requireOwner, type Tx } from './houses'
import { onPeriodUpdated } from './period-events'
import { findOrCreatePeriodTx, recomputeIfClosedTx, writePeriod } from './periods'

const DESCRIPTION_MAX = 100
/** Số lần tính lại tháng đích khi tháng vừa chọn bị chốt ngay trong lúc thêm khoản chi. */
const RESOLVE_ATTEMPTS = 3

export type ExpensePatch = { description?: string; amount?: number; spentOn?: string; paidByMemberId?: string }

function cleanDescription(raw: string): string {
  const d = typeof raw === 'string' ? raw.trim() : ''
  if (d.length < 1 || d.length > DESCRIPTION_MAX) {
    throw new AppError('INVALID', 'DESCRIPTION_INVALID', `Nội dung khoản chi gồm 1–${DESCRIPTION_MAX} ký tự`)
  }
  return d
}

function cleanAmount(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_MONEY) {
    throw new AppError('INVALID', 'AMOUNT_INVALID', 'Số tiền phải là số nguyên đồng, lớn hơn 0 và không quá 100 tỷ')
  }
  return n
}

/** Tháng dương lịch của ngày chi; ngày sai → INVALID SPENT_ON_INVALID. */
function monthOfSpentOn(spentOn: string): YM {
  return resolveExpenseMonth(spentOn, [])
}

async function assertPayerInPeriod(tx: Tx, periodId: string, memberId: string): Promise<void> {
  const [row] = await tx
    .select({ memberId: periodMembers.memberId })
    .from(periodMembers)
    .where(and(eq(periodMembers.periodId, periodId), eq(periodMembers.memberId, memberId)))
    .limit(1)
  if (!row) throw new AppError('INVALID', 'PAYER_NOT_IN_PERIOD', 'Người trả không có trong danh sách thành viên của tháng này')
}

/**
 * Thêm khoản chi lẻ. Không chỉ định `ym`: tính vào tháng của ngày chi, nếu tháng đó đã chốt thì sang tháng chưa chốt
 * kế tiếp (`movedFromClosed: true`); tháng đích chưa có thì tự tạo nháp. Chỉ định `ym` của tháng đã chốt
 * là sửa sau chốt: tháng đó được tính lại, revision += 1 và `onPeriodUpdated` được gọi sau khi commit.
 */
export async function addExpense(
  db: Db,
  actor: Actor,
  houseId: string,
  input: { description: string; amount: number; spentOn: string; paidByMemberId: string; ym?: YM },
): Promise<{ expenseId: string; ym: YM; movedFromClosed: boolean }> {
  const outcome = await db.transaction(async (tx) => {
    await requireOwner(tx, actor, houseId)
    const description = cleanDescription(input.description)
    const amount = cleanAmount(input.amount)
    const spentMonth = monthOfSpentOn(input.spentOn)
    const explicit = input.ym ? { year: input.ym.year, month: input.ym.month } : null
    if (explicit) daysInMonth(explicit) // kiểm tháng hợp lệ

    for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt++) {
      const ym =
        explicit ??
        resolveExpenseMonth(
          input.spentOn,
          await tx.select({ year: periods.year, month: periods.month, status: periods.status }).from(periods).where(eq(periods.houseId, houseId)),
        )
      const found = await findOrCreatePeriodTx(tx, houseId, ym)
      const [period] = await tx.select().from(periods).where(eq(periods.id, found.id)).for('no key update').limit(1)
      // tháng vừa bị chốt giữa lúc đọc và lúc khóa: tính lại tháng đích
      if (!explicit && period.status === 'closed') continue
      await assertPayerInPeriod(tx, period.id, input.paidByMemberId)
      const expenseId = newId()
      await tx.insert(expenses).values({
        id: expenseId,
        houseId,
        periodId: period.id,
        description,
        amount,
        paidByMemberId: input.paidByMemberId,
        spentOn: input.spentOn,
        createdBy: actor.userId,
      })
      const edited = await recomputeIfClosedTx(tx, period)
      const movedFromClosed = !explicit && (ym.year !== spentMonth.year || ym.month !== spentMonth.month)
      return { expenseId, ym, movedFromClosed, periodId: period.id, edited }
    }
    throw new AppError('CONFLICT', 'PERIOD_CLOSED', 'Tháng này vừa được chốt sổ, hãy thử lại')
  })
  if (outcome.edited) await onPeriodUpdated(db, outcome.periodId)
  return { expenseId: outcome.expenseId, ym: outcome.ym, movedFromClosed: outcome.movedFromClosed }
}

async function periodOfExpense(db: Db, expenseId: string): Promise<string> {
  const [row] = await db.select({ periodId: expenses.periodId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
  return row.periodId
}

/**
 * Sửa khoản chi. Khoản chi ở lại tháng nó đang thuộc về (đổi ngày chi không chuyển tháng; muốn chuyển thì xóa rồi thêm lại).
 * Tháng đã chốt → tính lại, revision += 1, `onPeriodUpdated`.
 */
export async function updateExpense(db: Db, actor: Actor, expenseId: string, patch: ExpensePatch): Promise<void> {
  const periodId = await periodOfExpense(db, expenseId)
  await writePeriod(db, actor, periodId, async (tx) => {
    const where = and(eq(expenses.id, expenseId), eq(expenses.periodId, periodId))
    const [row] = await tx.select({ id: expenses.id }).from(expenses).where(where).limit(1)
    if (!row) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
    const set: Partial<typeof expenses.$inferInsert> = {}
    if (patch.description !== undefined) set.description = cleanDescription(patch.description)
    if (patch.amount !== undefined) set.amount = cleanAmount(patch.amount)
    if (patch.spentOn !== undefined) {
      monthOfSpentOn(patch.spentOn)
      set.spentOn = patch.spentOn
    }
    if (patch.paidByMemberId !== undefined) {
      await assertPayerInPeriod(tx, periodId, patch.paidByMemberId)
      set.paidByMemberId = patch.paidByMemberId
    }
    if (Object.keys(set).length === 0) return false
    await tx.update(expenses).set(set).where(where)
    return true
  })
}

/** Xóa khoản chi. Tháng đã chốt → tính lại, revision += 1, `onPeriodUpdated`. */
export async function deleteExpense(db: Db, actor: Actor, expenseId: string): Promise<void> {
  const periodId = await periodOfExpense(db, expenseId)
  await writePeriod(db, actor, periodId, async (tx) => {
    const deleted = await tx
      .delete(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.periodId, periodId)))
      .returning({ id: expenses.id })
    if (deleted.length === 0) throw new AppError('NOT_FOUND', 'EXPENSE_NOT_FOUND', 'Không tìm thấy khoản chi')
    return true
  })
}
