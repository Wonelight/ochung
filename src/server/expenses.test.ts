import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { expenses, periods, user } from '@/db/schema'
import type { YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import { addExpense, deleteExpense, updateExpense } from './expenses'
import { addMemberTx, createHouse, listMembers } from './houses'
import * as events from './period-events'
import { closePeriod, getOrCreateDraftPeriod, getPeriodView, listPeriods, setUtilityReading } from './periods'

const T11: YM = { year: 2026, month: 11 }

async function expectApp(p: Promise<unknown>, code: string, reason?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (reason) expect((err as AppError).reason).toBe(reason)
}

describe('chi phát sinh', () => {
  let db: Db
  let seq = 0

  beforeAll(async () => {
    db = await createTestDb()
  }, 30_000)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function newUser(name: string): Promise<Actor> {
    const n = seq++
    const id = newId()
    await db.insert(user).values({ id, name, email: `e${n}@nha.local`, accountCode: `E-${String(n).padStart(5, '0')}` })
    return { userId: id, role: 'user' }
  }

  /** Nhà 2 người (chủ + An), chưa có tháng nào. */
  async function setup() {
    const owner = await newUser('Linh')
    const an = await newUser('An')
    const { houseId } = await createHouse(db, owner, { name: 'Nhà chi lẻ' })
    const anId = (await db.transaction((tx) => addMemberTx(tx, houseId, an.userId))).id
    const ownerId = (await listMembers(db, owner, houseId)).find((m) => m.role === 'owner')!.id
    return { owner, an, houseId, anId, ownerId }
  }

  /** Tháng 11 đã chốt: điện 100.000, nước 50.000, An ứng 40.000 (chia 2 → mỗi người 95.000). */
  async function closedT11() {
    const s = await setup()
    const { periodId } = await getOrCreateDraftPeriod(db, s.owner, s.houseId, T11)
    await setUtilityReading(db, s.owner, periodId, 'electricity', { total: 100_000 })
    await setUtilityReading(db, s.owner, periodId, 'water', { total: 50_000 })
    const { expenseId } = await addExpense(db, s.owner, s.houseId, {
      description: 'Nước giặt',
      amount: 40_000,
      spentOn: '2026-11-03',
      paidByMemberId: s.anId,
    })
    await closePeriod(db, s.owner, periodId)
    return { ...s, periodId, expenseId }
  }

  async function periodRow(periodId: string) {
    const [row] = await db.select().from(periods).where(eq(periods.id, periodId))
    return row
  }

  function dueOf(result: { payslips: { memberId: string; due: number | null }[] }, memberId: string) {
    return result.payslips.find((p) => p.memberId === memberId)!.due
  }

  it('tháng của ngày chi còn nháp (hoặc chưa có) → tính vào tháng đó, tự tạo tháng nháp', async () => {
    const s = await setup()
    const res = await addExpense(db, s.owner, s.houseId, {
      description: '  Giấy vệ sinh ',
      amount: 120_000,
      spentOn: '2026-11-20',
      paidByMemberId: s.ownerId,
    })
    expect(res.ym).toEqual(T11)
    expect(res.movedFromClosed).toBe(false)
    const [row] = await db.select().from(expenses).where(eq(expenses.id, res.expenseId))
    expect(row).toMatchObject({ description: 'Giấy vệ sinh', amount: 120_000, spentOn: '2026-11-20', createdBy: s.owner.userId })
    const list = await listPeriods(db, s.owner, s.houseId)
    expect(list.map((p) => [p.year, p.month, p.status])).toEqual([[2026, 11, 'draft']])
    expect(row.periodId).toBe(list[0].id)
  })

  it('spentOn 2026-11-28 khi T11 đã chốt → ym {2026,12}, movedFromClosed true, tự tạo nháp T12', async () => {
    const s = await closedT11()
    const spy = vi.spyOn(events, 'onPeriodUpdated')
    const res = await addExpense(db, s.owner, s.houseId, {
      description: 'Bóng đèn',
      amount: 60_000,
      spentOn: '2026-11-28',
      paidByMemberId: s.anId,
    })
    expect(res.ym).toEqual({ year: 2026, month: 12 })
    expect(res.movedFromClosed).toBe(true)
    const list = await listPeriods(db, s.owner, s.houseId)
    expect(list.map((p) => [p.month, p.status])).toEqual([
      [12, 'draft'],
      [11, 'closed'],
    ])
    const [row] = await db.select().from(expenses).where(eq(expenses.id, res.expenseId))
    expect(row.periodId).toBe(list[0].id)
    // tháng 11 đã chốt không bị đụng tới
    expect((await periodRow(s.periodId)).revision).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('chủ nhà chọn hẳn tháng đã chốt (ym) → sửa sau chốt: tính lại, revision +1, onPeriodUpdated 1 lần', async () => {
    const s = await closedT11()
    const spy = vi.spyOn(events, 'onPeriodUpdated')
    const res = await addExpense(db, s.owner, s.houseId, {
      description: 'Bóng đèn',
      amount: 60_000,
      spentOn: '2026-11-28',
      paidByMemberId: s.ownerId,
      ym: T11,
    })
    expect(res).toMatchObject({ ym: T11, movedFromClosed: false })
    const row = await periodRow(s.periodId)
    expect(row.revision).toBe(1)
    expect(row.status).toBe('closed')
    expect(row.result!.grandTotal).toBe(250_000)
    expect(dueOf(row.result!, s.anId)).toBe(125_000 - 40_000)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toBe(s.periodId)
  })

  it('updateExpense / deleteExpense ở tháng đã chốt → mỗi lần revision +1, hook 1 lần, số tiền tính lại', async () => {
    const s = await closedT11()
    const spy = vi.spyOn(events, 'onPeriodUpdated')
    await updateExpense(db, s.owner, s.expenseId, { amount: 60_000, description: 'Nước giặt to' })
    let row = await periodRow(s.periodId)
    expect(row.revision).toBe(1)
    expect(dueOf(row.result!, s.anId)).toBe(105_000 - 60_000)
    await updateExpense(db, s.owner, s.expenseId, { paidByMemberId: s.ownerId })
    row = await periodRow(s.periodId)
    expect(dueOf(row.result!, s.anId)).toBe(105_000)
    await deleteExpense(db, s.owner, s.expenseId)
    row = await periodRow(s.periodId)
    expect(row.revision).toBe(3)
    expect(row.result!.grandTotal).toBe(150_000)
    expect(dueOf(row.result!, s.anId)).toBe(75_000)
    expect(spy).toHaveBeenCalledTimes(3)
    expect(await db.select().from(expenses).where(eq(expenses.id, s.expenseId))).toEqual([])
  })

  it('updateExpense ghi lại đúng giá trị cũ ở tháng đã chốt → revision giữ nguyên, không gọi hook', async () => {
    const s = await closedT11()
    const spy = vi.spyOn(events, 'onPeriodUpdated')
    await updateExpense(db, s.owner, s.expenseId, { description: ' Nước giặt ', amount: 40_000, spentOn: '2026-11-03', paidByMemberId: s.anId })
    await updateExpense(db, s.owner, s.expenseId, {})
    expect((await periodRow(s.periodId)).revision).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('sửa/xóa khoản chi ở tháng nháp → không đổi revision, không gọi hook', async () => {
    const s = await setup()
    const spy = vi.spyOn(events, 'onPeriodUpdated')
    const { expenseId } = await addExpense(db, s.owner, s.houseId, { description: 'A', amount: 10_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
    await updateExpense(db, s.owner, expenseId, { amount: 20_000, spentOn: '2026-11-03' })
    const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId))
    expect(row).toMatchObject({ amount: 20_000, spentOn: '2026-11-03' })
    expect((await periodRow(row.periodId)).revision).toBe(0)
    await deleteExpense(db, s.owner, expenseId)
    expect(spy).not.toHaveBeenCalled()
  })

  it('người trả không thuộc tháng đó → INVALID PAYER_NOT_IN_PERIOD', async () => {
    const a = await setup()
    const b = await setup()
    await expectApp(
      addExpense(db, a.owner, a.houseId, { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: b.anId }),
      'INVALID',
      'PAYER_NOT_IN_PERIOD',
    )
    const { expenseId } = await addExpense(db, a.owner, a.houseId, { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: a.anId })
    await expectApp(updateExpense(db, a.owner, expenseId, { paidByMemberId: b.anId }), 'INVALID', 'PAYER_NOT_IN_PERIOD')
  })

  it('số tiền, nội dung, ngày, tháng không hợp lệ → INVALID', async () => {
    const s = await setup()
    const base = { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: s.anId }
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, amount: 0 }), 'INVALID', 'AMOUNT_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, amount: -5 }), 'INVALID', 'AMOUNT_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, amount: 10.5 }), 'INVALID', 'AMOUNT_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, amount: 100_000_000_001 }), 'INVALID', 'AMOUNT_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, description: '   ' }), 'INVALID', 'DESCRIPTION_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, spentOn: '2026-02-30' }), 'INVALID', 'SPENT_ON_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, ym: { year: 2026, month: 0 } }), 'INVALID', 'MONTH_INVALID')
    expect(await listPeriods(db, s.owner, s.houseId)).toEqual([])
  })

  it('thành viên thêm/sửa/xóa khoản chi → FORBIDDEN (Review Focus #5); người ngoài cũng vậy', async () => {
    const s = await closedT11()
    const stranger = await newUser('Lạ')
    const input = { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: s.anId }
    await expectApp(addExpense(db, s.an, s.houseId, input), 'FORBIDDEN', 'NOT_OWNER')
    await expectApp(addExpense(db, s.an, s.houseId, { ...input, ym: T11 }), 'FORBIDDEN', 'NOT_OWNER')
    await expectApp(updateExpense(db, s.an, s.expenseId, { amount: 1 }), 'FORBIDDEN', 'NOT_OWNER')
    await expectApp(deleteExpense(db, s.an, s.expenseId), 'FORBIDDEN', 'NOT_OWNER')
    await expectApp(addExpense(db, stranger, s.houseId, input), 'FORBIDDEN')
    await expectApp(deleteExpense(db, stranger, s.expenseId), 'FORBIDDEN')
    await expectApp(deleteExpense(db, s.owner, newId()), 'NOT_FOUND')
    expect((await periodRow(s.periodId)).revision).toBe(0)
    expect((await getPeriodView(db, s.an, s.periodId)).result.grandTotal).toBe(190_000)
  })
})
