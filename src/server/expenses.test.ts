import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { expenses, periods, user } from '@/db/schema'
import type { YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import { addExpense, deleteExpense, getPeriodExpenses, listMyExpenses, summarizeHouseExpenses, updateExpense } from './expenses'
import { addMemberTx, archiveHouse, createHouse, listMembers, removeMember } from './houses'
import * as events from './period-events'
import { closePeriod, getOrCreateDraftPeriod, getPeriodView, listPeriods, setPeriodMember, setUtilityReading } from './periods'

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

  beforeEach(() => {
    // thành viên bị giới hạn theo "hôm nay" (không ghi ngày tương lai, không mở tháng quá khứ): cố định ngày cho test ổn định
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-12T05:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
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
    // trần của một khoản chi lẻ là 100 triệu đồng (cả chủ nhà lẫn thành viên)
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, amount: 100_000_001 }), 'INVALID', 'AMOUNT_INVALID')
    await expectApp(addExpense(db, s.an, s.houseId, { ...base, amount: 100_000_001 }), 'INVALID', 'AMOUNT_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, description: '   ' }), 'INVALID', 'DESCRIPTION_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, spentOn: '2026-02-30' }), 'INVALID', 'SPENT_ON_INVALID')
    await expectApp(addExpense(db, s.owner, s.houseId, { ...base, ym: { year: 2026, month: 0 } }), 'INVALID', 'MONTH_INVALID')
    expect(await listPeriods(db, s.owner, s.houseId)).toEqual([])
  })

  it('người ngoài nhà không thêm/sửa/xóa khoản chi; xóa khoản không tồn tại → NOT_FOUND', async () => {
    const s = await closedT11()
    const stranger = await newUser('Lạ')
    const input = { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: s.anId }
    await expectApp(addExpense(db, stranger, s.houseId, input), 'FORBIDDEN')
    await expectApp(updateExpense(db, stranger, s.expenseId, { amount: 1 }), 'FORBIDDEN')
    await expectApp(deleteExpense(db, stranger, s.expenseId), 'FORBIDDEN')
    await expectApp(deleteExpense(db, s.owner, newId()), 'NOT_FOUND')
    expect((await periodRow(s.periodId)).revision).toBe(0)
    expect((await getPeriodView(db, s.an, s.periodId)).result.grandTotal).toBe(190_000)
  })

  it('khoản chi đúng trần 100 triệu đồng thì được; sửa vượt trần thì bị từ chối', async () => {
    const s = await setup()
    const ok = await addExpense(db, s.owner, s.houseId, { description: 'Mua tủ lạnh', amount: 100_000_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
    expect((await db.select().from(expenses).where(eq(expenses.id, ok.expenseId)))[0].amount).toBe(100_000_000)
    await expectApp(updateExpense(db, s.owner, ok.expenseId, { amount: 100_000_001 }), 'INVALID', 'AMOUNT_INVALID')
  })

  describe('thành viên (không phải chủ nhà)', () => {
    it('thêm khoản chi do chính mình trả: vào tháng nháp, ghi người tạo; tháng đã chốt không bị đụng tới', async () => {
      const s = await closedT11()
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      const res = await addExpense(db, s.an, s.houseId, {
        description: 'Bột giặt',
        amount: 130_000,
        spentOn: '2026-11-05', // T11 đã chốt → sang T12 nháp
        paidByMemberId: s.anId,
      })
      expect(res.ym).toEqual({ year: 2026, month: 12 })
      expect(res.movedFromClosed).toBe(true)
      const [row] = await db.select().from(expenses).where(eq(expenses.id, res.expenseId))
      expect(row).toMatchObject({ amount: 130_000, paidByMemberId: s.anId, createdBy: s.an.userId })
      expect((await periodRow(s.periodId)).revision).toBe(0)
      expect(spy).not.toHaveBeenCalled()
      // thành viên thấy cả tháng nháp T12 (chỉ đọc) lẫn tháng T11 đã chốt
      expect((await listPeriods(db, s.an, s.houseId)).map((p) => p.month)).toEqual([12, 11])
    })

    it('không được ghi thay người khác, không được chọn tháng, không được ghi ngày ở tương lai', async () => {
      const s = await closedT11()
      const input = { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: s.anId }
      await expectApp(addExpense(db, s.an, s.houseId, { ...input, paidByMemberId: s.ownerId }), 'FORBIDDEN', 'PAYER_NOT_SELF')
      await expectApp(addExpense(db, s.an, s.houseId, { ...input, ym: T11 }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(addExpense(db, s.an, s.houseId, { ...input, spentOn: '2999-01-01' }), 'INVALID', 'SPENT_ON_FUTURE')
      // chủ nhà vẫn ghi thay người khác được
      await addExpense(db, s.owner, s.houseId, { ...input, description: 'Chủ ghi thay', paidByMemberId: s.anId })
      expect(await db.select().from(expenses).where(eq(expenses.description, 'Chủ ghi thay'))).toHaveLength(1)
    })

    it('người đã rời nhà và nhà đã lưu trữ: không thêm được', async () => {
      const s = await setup()
      const input = { description: 'X', amount: 1_000, spentOn: '2026-11-02', paidByMemberId: s.anId }
      await archiveHouse(db, s.owner, s.houseId, { force: true })
      await expectApp(addExpense(db, s.an, s.houseId, input), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      const t = await setup()
      await removeMember(db, t.owner, t.houseId, t.anId)
      await expectApp(addExpense(db, t.an, t.houseId, { ...input, paidByMemberId: t.anId }), 'FORBIDDEN', 'NOT_MEMBER')
    })

    it('sửa/xóa khoản chi của chính mình khi tháng còn nháp', async () => {
      const s = await setup()
      const mine = await addExpense(db, s.an, s.houseId, { description: 'Gõ nhầm', amount: 1_500_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
      await updateExpense(db, s.an, mine.expenseId, { amount: 150_000, description: 'Nước lọc' })
      expect((await db.select().from(expenses).where(eq(expenses.id, mine.expenseId)))[0]).toMatchObject({ amount: 150_000, description: 'Nước lọc' })
      await deleteExpense(db, s.an, mine.expenseId)
      expect(await db.select().from(expenses).where(eq(expenses.id, mine.expenseId))).toEqual([])
    })

    it('không sửa/xóa khoản chi của người khác, không đổi người trả sang người khác', async () => {
      const s = await setup()
      const byOwner = await addExpense(db, s.owner, s.houseId, { description: 'Của chủ', amount: 10_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
      await expectApp(updateExpense(db, s.an, byOwner.expenseId, { amount: 1 }), 'FORBIDDEN', 'NOT_EXPENSE_AUTHOR')
      await expectApp(deleteExpense(db, s.an, byOwner.expenseId), 'FORBIDDEN', 'NOT_EXPENSE_AUTHOR')
      const mine = await addExpense(db, s.an, s.houseId, { description: 'Của An', amount: 20_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
      await expectApp(updateExpense(db, s.an, mine.expenseId, { paidByMemberId: s.ownerId }), 'FORBIDDEN', 'PAYER_NOT_SELF')
      expect((await db.select().from(expenses).where(eq(expenses.id, byOwner.expenseId)))[0].amount).toBe(10_000)
    })

    it('khoản chi của mình nằm trong tháng đã chốt thì không còn sửa/xóa được, tháng giữ nguyên', async () => {
      const s = await setup()
      const mine = await addExpense(db, s.an, s.houseId, { description: 'Của An', amount: 20_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
      const periodId = (await listPeriods(db, s.owner, s.houseId))[0].id
      await setUtilityReading(db, s.owner, periodId, 'electricity', { total: 100_000 })
      await setUtilityReading(db, s.owner, periodId, 'water', { total: 50_000 })
      await closePeriod(db, s.owner, periodId)
      await expectApp(updateExpense(db, s.an, mine.expenseId, { amount: 1 }), 'FORBIDDEN', 'PERIOD_CLOSED')
      await expectApp(deleteExpense(db, s.an, mine.expenseId), 'FORBIDDEN', 'PERIOD_CLOSED')
      expect((await periodRow(periodId)).revision).toBe(0)
    })

    it('listMyExpenses: chỉ khoản mình thêm ở các tháng còn nháp', async () => {
      const s = await setup()
      await addExpense(db, s.an, s.houseId, { description: 'Của An', amount: 20_000, spentOn: '2026-11-02', paidByMemberId: s.anId })
      await addExpense(db, s.owner, s.houseId, { description: 'Của chủ', amount: 10_000, spentOn: '2026-11-03', paidByMemberId: s.ownerId })
      const mine = await listMyExpenses(db, s.an, s.houseId)
      expect(mine.map((e) => [e.description, e.amount, e.ym])).toEqual([['Của An', 20_000, T11]])
      await expectApp(listMyExpenses(db, await newUser('Lạ'), s.houseId), 'FORBIDDEN')
    })
  })

  describe('người chia khoản chi', () => {
    /** Nhà 3 người: chủ + An + Bình, chưa có tháng nào. */
    async function three() {
      const s = await setup()
      const binh = await newUser('Bình')
      const binhId = (await db.transaction((tx) => addMemberTx(tx, s.houseId, binh.userId))).id
      return { ...s, binh, binhId }
    }
    const base = { description: 'Máy lọc nước', amount: 300_000, spentOn: '2026-11-02' }
    const rowOf = async (id: string) => (await db.select().from(expenses).where(eq(expenses.id, id)))[0]

    it('mặc định không chỉ định → lưu null (cả nhà); chọn người thì lưu danh sách, bỏ id lặp', async () => {
      const s = await three()
      const all = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.anId })
      expect((await rowOf(all.expenseId)).participantIds).toBeNull()
      const some = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [s.anId, s.binhId, s.anId] })
      expect((await rowOf(some.expenseId)).participantIds).toEqual([s.anId, s.binhId])
      const reset = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: null })
      expect((await rowOf(reset.expenseId)).participantIds).toBeNull()
    })

    it('danh sách rỗng hoặc có người không thuộc tháng → INVALID, không ghi gì', async () => {
      const s = await three()
      const before = (await db.select().from(expenses)).length
      await expectApp(addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [] }), 'INVALID', 'PARTICIPANTS_INVALID')
      await expectApp(addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [newId()] }), 'INVALID', 'PARTICIPANT_NOT_IN_PERIOD')
      expect((await db.select().from(expenses)).length).toBe(before)
    })

    it('thành viên cũng được chọn người chia (kể cả không có mình), vẫn chỉ ghi khoản do mình trả', async () => {
      const s = await three()
      const res = await addExpense(db, s.an, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [s.binhId] })
      expect((await rowOf(res.expenseId)).participantIds).toEqual([s.binhId])
      await expectApp(
        addExpense(db, s.an, s.houseId, { ...base, paidByMemberId: s.binhId, participantIds: [s.anId] }),
        'FORBIDDEN',
        'PAYER_NOT_SELF',
      )
    })

    it('sửa: đổi người chia, null trả về cả nhà, không đổi gì thì không ghi', async () => {
      const s = await three()
      const res = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [s.anId, s.binhId] })
      await updateExpense(db, s.owner, res.expenseId, { participantIds: [s.binhId] })
      expect((await rowOf(res.expenseId)).participantIds).toEqual([s.binhId])
      await updateExpense(db, s.owner, res.expenseId, { participantIds: null })
      expect((await rowOf(res.expenseId)).participantIds).toBeNull()
      await expectApp(updateExpense(db, s.owner, res.expenseId, { participantIds: [] }), 'INVALID', 'PARTICIPANTS_INVALID')
      await expectApp(updateExpense(db, s.owner, res.expenseId, { participantIds: [newId()] }), 'INVALID', 'PARTICIPANT_NOT_IN_PERIOD')
    })

    it('sửa người chia ở tháng đã chốt: tính lại phiếu, revision +1', async () => {
      const s = await closedT11() // 2 người, khoản 40.000 do An ứng, chia 2
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await updateExpense(db, s.owner, s.expenseId, { participantIds: [s.anId] })
      expect((await periodRow(s.periodId)).revision).toBe(1)
      expect(spy).toHaveBeenCalledTimes(1)
      const result = (await getPeriodView(db, s.an, s.periodId)).result
      expect(result.payslips.find((p) => p.memberId === s.anId)!.share).toBe(75_000 + 40_000) // điện nước ÷2 + cả khoản chi
      expect(result.payslips.find((p) => p.memberId === s.ownerId)!.share).toBe(75_000)
      expect(result.grandTotal).toBe(190_000)
    })

    it('chi tiết tháng: mọi thành viên thấy khoản của mọi người kể cả tháng nháp, kèm người trả, người nhập, người chia', async () => {
      const s = await three()
      const owned = await addExpense(db, s.owner, s.houseId, { ...base, description: 'Của chủ', paidByMemberId: s.ownerId })
      await addExpense(db, s.an, s.houseId, { ...base, description: 'Của An', amount: 50_000, paidByMemberId: s.anId, participantIds: [s.binhId] })
      const periodId = (await rowOf(owned.expenseId)).periodId
      const view = await getPeriodExpenses(db, s.binh, periodId)
      expect(view).toMatchObject({ periodId, ym: T11, status: 'draft', total: 350_000 })
      const byName = Object.fromEntries(view.expenses.map((e) => [e.description, e]))
      expect(byName['Của chủ']).toMatchObject({ amount: 300_000, paidByName: 'Linh', createdByName: 'Linh', participants: null, mine: false })
      expect(byName['Của An']).toMatchObject({ paidByName: 'An', createdByName: 'An', mine: false })
      expect(byName['Của An'].participants).toEqual([{ id: s.binhId, name: 'Bình' }])
      expect((await getPeriodExpenses(db, s.an, periodId)).expenses.find((e) => e.description === 'Của An')!.mine).toBe(true)
    })

    it('tổng hợp theo tháng: tổng, số khoản, người ứng (nhiều nhất trước); tháng đã chốt vẫn hiện, mới nhất trước', async () => {
      const s = await closedT11() // T11 đã chốt, có 1 khoản 40.000 do An ứng
      await addExpense(db, s.owner, s.houseId, { ...base, description: 'Sang T12', paidByMemberId: s.ownerId, spentOn: '2026-11-20' })
      await addExpense(db, s.an, s.houseId, { ...base, description: 'Của An T12', amount: 50_000, paidByMemberId: s.anId, spentOn: '2026-11-10' })
      const months = await summarizeHouseExpenses(db, s.an, s.houseId)
      expect(months.map((m) => [m.ym.month, m.status, m.count, m.total])).toEqual([
        [12, 'draft', 2, 350_000],
        [11, 'closed', 1, 40_000],
      ])
      expect(months[0].byPayer.map((p) => [p.name, p.total, p.count])).toEqual([
        ['Linh', 300_000, 1],
        ['An', 50_000, 1],
      ])
      expect(months[1].byPayer).toEqual([{ memberId: s.anId, name: 'An', total: 40_000, count: 1 }])
    })

    it('tổng hợp và chi tiết tháng: tháng chưa có khoản nào trả rỗng; người ngoài, người đã rời → FORBIDDEN; id tháng lạ → NOT_FOUND', async () => {
      const s = await closedT11()
      const stranger = await newUser('Lạ')
      const t12 = (await getOrCreateDraftPeriod(db, s.owner, s.houseId, { year: 2026, month: 12 })).periodId
      expect(await getPeriodExpenses(db, s.an, t12)).toMatchObject({ status: 'draft', expenses: [], total: 0 })
      await expectApp(summarizeHouseExpenses(db, stranger, s.houseId), 'FORBIDDEN')
      await expectApp(getPeriodExpenses(db, stranger, s.periodId), 'FORBIDDEN')
      await expectApp(getPeriodExpenses(db, s.an, newId()), 'NOT_FOUND')
      await removeMember(db, s.owner, s.houseId, s.anId)
      await expectApp(summarizeHouseExpenses(db, s.an, s.houseId), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(getPeriodExpenses(db, s.an, s.periodId), 'FORBIDDEN', 'NOT_MEMBER')
    })

    it('thành viên không tạo được tháng nháp quá khứ chưa có hóa đơn; tháng đã có sẵn, tháng tiêu thụ mặc định và tháng hiện tại thì được', async () => {
      const s = await three()
      await expectApp(addExpense(db, s.an, s.houseId, { ...base, spentOn: '2001-01-15', paidByMemberId: s.anId }), 'FORBIDDEN', 'MONTH_NOT_OPEN')
      await expectApp(addExpense(db, s.an, s.houseId, { ...base, spentOn: '2026-08-15', paidByMemberId: s.anId }), 'FORBIDDEN', 'MONTH_NOT_OPEN')
      expect(await listPeriods(db, s.owner, s.houseId)).toEqual([])
      // tháng 9 chủ nhà đã mở nháp → thành viên ghi vào đó được
      await getOrCreateDraftPeriod(db, s.owner, s.houseId, { year: 2026, month: 9 })
      await addExpense(db, s.an, s.houseId, { ...base, spentOn: '2026-09-10', paidByMemberId: s.anId })
      // ngày giả là 12/11/2026: tháng tiêu thụ mặc định là T10, tháng hiện tại T11
      await addExpense(db, s.an, s.houseId, { ...base, spentOn: '2026-10-20', paidByMemberId: s.anId })
      await addExpense(db, s.an, s.houseId, { ...base, spentOn: '2026-11-12', paidByMemberId: s.anId })
      expect((await listPeriods(db, s.owner, s.houseId)).map((p) => p.month).sort((a, b) => a - b)).toEqual([9, 10, 11])
    })

    it('thành viên phải chọn ít nhất một người đang được tính (cả khi thêm lẫn khi sửa); lẫn người bị tắt thì được; chủ nhà không bị giới hạn', async () => {
      const s = await three()
      const first = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.ownerId })
      const periodId = (await rowOf(first.expenseId)).periodId
      await setPeriodMember(db, s.owner, periodId, s.binhId, { included: false })
      await expectApp(
        addExpense(db, s.an, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [s.binhId] }),
        'INVALID',
        'PARTICIPANT_NOT_COUNTED',
      )
      const mine = await addExpense(db, s.an, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [s.anId] })
      await expectApp(updateExpense(db, s.an, mine.expenseId, { participantIds: [s.binhId] }), 'INVALID', 'PARTICIPANT_NOT_COUNTED')
      // lẫn người bị tắt với người đang được tính: được (người bị tắt bị bỏ qua khi tính)
      const mixed = await addExpense(db, s.an, s.houseId, { ...base, paidByMemberId: s.anId, participantIds: [s.anId, s.binhId] })
      expect((await rowOf(mixed.expenseId)).participantIds).toEqual([s.anId, s.binhId])
      await updateExpense(db, s.an, mixed.expenseId, { participantIds: [s.binhId, s.ownerId] })
      await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.ownerId, participantIds: [s.binhId] })
    })

    it('người rời rồi vào lại: khoản chi chia riêng cho họ chuyển sang dòng thành viên mới', async () => {
      const s = await three()
      const e = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.ownerId, participantIds: [s.anId, s.binhId] })
      await removeMember(db, s.owner, s.houseId, s.anId)
      const again = await db.transaction((tx) => addMemberTx(tx, s.houseId, s.an.userId))
      expect(again.id).not.toBe(s.anId)
      expect((await rowOf(e.expenseId)).participantIds).toEqual([again.id, s.binhId])
    })

    it('người ở nhà khác không đọc/thêm/sửa/xóa được; id người chia hoặc người trả của nhà khác bị từ chối', async () => {
      const s = await three()
      const other = await setup()
      const mine = await addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.ownerId })
      await expectApp(addExpense(db, other.an, s.houseId, { ...base, paidByMemberId: other.anId }), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(updateExpense(db, other.an, mine.expenseId, { amount: 1 }), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(updateExpense(db, other.owner, mine.expenseId, { amount: 1 }), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(deleteExpense(db, other.owner, mine.expenseId), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(summarizeHouseExpenses(db, other.an, s.houseId), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(getPeriodExpenses(db, other.an, (await rowOf(mine.expenseId)).periodId), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(listMyExpenses(db, other.an, s.houseId), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(
        addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.ownerId, participantIds: [other.anId] }),
        'INVALID',
        'PARTICIPANT_NOT_IN_PERIOD',
      )
      await expectApp(addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: other.anId }), 'INVALID', 'PAYER_NOT_IN_PERIOD')
      expect((await rowOf(mine.expenseId)).amount).toBe(300_000)
    })

    it('người đã rời nhà hoặc nhà đã lưu trữ không sửa/xóa được khoản chi của mình', async () => {
      const s = await three()
      const mine = await addExpense(db, s.binh, s.houseId, { ...base, paidByMemberId: s.binhId })
      await removeMember(db, s.owner, s.houseId, s.binhId)
      await expectApp(updateExpense(db, s.binh, mine.expenseId, { amount: 1 }), 'FORBIDDEN', 'NOT_MEMBER')
      await expectApp(deleteExpense(db, s.binh, mine.expenseId), 'FORBIDDEN', 'NOT_MEMBER')
      const t = await three()
      const own = await addExpense(db, t.an, t.houseId, { ...base, paidByMemberId: t.anId })
      await archiveHouse(db, t.owner, t.houseId, { force: true })
      await expectApp(updateExpense(db, t.an, own.expenseId, { amount: 1 }), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(deleteExpense(db, t.an, own.expenseId), 'FORBIDDEN', 'HOUSE_ARCHIVED')
    })

    it('chủ nhà đổi người trả khoản của thành viên thì thành viên không sửa/xóa khoản đó nữa', async () => {
      const s = await three()
      const mine = await addExpense(db, s.an, s.houseId, { ...base, paidByMemberId: s.anId })
      await updateExpense(db, s.owner, mine.expenseId, { paidByMemberId: s.binhId })
      await expectApp(updateExpense(db, s.an, mine.expenseId, { amount: 1 }), 'FORBIDDEN', 'EXPENSE_REASSIGNED')
      await expectApp(deleteExpense(db, s.an, mine.expenseId), 'FORBIDDEN', 'EXPENSE_REASSIGNED')
    })

    it('danh sách người chia quá dài bị từ chối', async () => {
      const s = await three()
      const ids = Array.from({ length: 51 }, () => newId())
      await expectApp(addExpense(db, s.owner, s.houseId, { ...base, paidByMemberId: s.ownerId, participantIds: ids }), 'INVALID', 'PARTICIPANTS_INVALID')
    })

    it('sổ khoản chi chỉ lấy 6 tháng gần nhất có khoản chi', async () => {
      const s = await three()
      for (let m = 1; m <= 8; m++) {
        await addExpense(db, s.owner, s.houseId, {
          ...base,
          description: `T${m}`,
          paidByMemberId: s.ownerId,
          ym: { year: 2026, month: m },
          spentOn: `2026-${String(m).padStart(2, '0')}-02`,
        })
      }
      expect((await summarizeHouseExpenses(db, s.an, s.houseId)).map((m) => m.ym.month)).toEqual([8, 7, 6, 5, 4, 3])
    })
  })
})
