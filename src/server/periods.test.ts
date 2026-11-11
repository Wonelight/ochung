import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { periodItems, periods, user } from '@/db/schema'
import type { Tariff, YM } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { paymentRows } from '@/lib/payments-view'
import type { Actor } from './actor'
import { addExpense } from './expenses'
import { deleteChargeItem, setDueDay, setMemberQty, setUtilityTariff, upsertChargeItem } from './house-settings'
import { addMemberTx, archiveHouse, createHouse, leaveHouse, listMembers, removeMember } from './houses'
import { confirmPayment, getStatuses, hasOutstandingBalance, recordRefund, submitTransfer } from './payments'
import * as events from './period-events'
import {
  applyPeriodEdits,
  buildPeriodInput,
  closePeriod,
  getOrCreateDraftPeriod,
  getPeriodEditor,
  getPeriodView,
  listPeriods,
  previewPeriod,
  setPeriodItemEnabled,
  setPeriodMember,
  setUtilityReading,
} from './periods'

const T10: YM = { year: 2026, month: 10 }
const T11: YM = { year: 2026, month: 11 }
const T12: YM = { year: 2026, month: 12 }

const ELEC_TARIFF: Tariff = {
  tiers: [{ upTo: null, price: 3_500 }],
  perPerson: false,
  registeredPeople: 1,
  vatPct: 0,
  surcharges: [],
}

async function expectApp(p: Promise<unknown>, code: string, reason?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (reason) expect((err as AppError).reason).toBe(reason)
}

describe('vòng đời tháng', () => {
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
    await db.insert(user).values({ id, name, email: `p${n}@nha.local`, accountCode: `P-${String(n).padStart(5, '0')}` })
    return { userId: id, role: 'user' }
  }

  async function join(houseId: string, who: Actor): Promise<string> {
    const m = await db.transaction((tx) => addMemberTx(tx, houseId, who.userId))
    return m.id
  }

  /** Nhà của ví dụ spec §5.4: cấu hình xong, tháng 11 chưa tạo. */
  async function house54() {
    const linh = await newUser('Linh')
    const an = await newUser('An')
    const binh = await newUser('Bình')
    const chi = await newUser('Chi')
    const { houseId } = await createHouse(db, linh, { name: 'Nhà 5.4' })
    const anId = await join(houseId, an)
    const binhId = await join(houseId, binh)
    const chiId = await join(houseId, chi)
    const linhId = (await listMembers(db, linh, houseId)).find((m) => m.role === 'owner')!.id
    const nha = await upsertChargeItem(db, linh, houseId, { name: 'Tiền nhà', kind: 'equal', amount: 8_000_000, active: true })
    const dv = await upsertChargeItem(db, linh, houseId, { name: 'Phí dịch vụ', kind: 'equal', amount: 600_000, active: true })
    const xe = await upsertChargeItem(db, linh, houseId, { name: 'Xe', kind: 'per_unit', amount: 120_000, active: true })
    for (const id of [linhId, anId, chiId]) await setMemberQty(db, linh, id, xe, 1)
    return { linh, an, binh, chi, houseId, linhId, anId, binhId, chiId, items: { nha, dv, xe } }
  }

  /** Ví dụ §5.4 với tháng 11 đã nhập đủ (chưa chốt). */
  async function draft54() {
    const h = await house54()
    const { periodId } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
    await setPeriodMember(db, h.linh, periodId, h.chiId, { days: 15 })
    await setUtilityReading(db, h.linh, periodId, 'electricity', { total: 1_260_000 })
    await setUtilityReading(db, h.linh, periodId, 'water', { total: 315_000 })
    await addExpense(db, h.linh, h.houseId, { description: 'Nước giặt', amount: 200_000, spentOn: '2026-11-05', paidByMemberId: h.anId })
    await addExpense(db, h.linh, h.houseId, { description: 'Giấy vệ sinh', amount: 120_000, spentOn: '2026-11-12', paidByMemberId: h.linhId })
    return { ...h, periodId }
  }

  function slipOf(result: { payslips: { memberId: string; share: number; due: number | null; advanced: number }[] }, memberId: string) {
    const slip = result.payslips.find((p) => p.memberId === memberId)
    if (!slip) throw new Error(`không có phiếu của ${memberId}`)
    return slip
  }

  async function periodRow(periodId: string) {
    const [row] = await db.select().from(periods).where(eq(periods.id, periodId))
    return row
  }

  describe('ví dụ spec §5.4', () => {
    it('chốt sổ qua các hàm server → due của An/Bình/Chi = 2.600.000 / 2.680.000 / 2.575.000', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const view = await getPeriodView(db, h.linh, h.periodId)
      expect(view.period.status).toBe('closed')
      expect(view.period.closedAt).toBeInstanceOf(Date)
      expect(view.period.revision).toBe(0)
      expect(view.period.dueDate).toBe('2026-12-10')
      expect(view.result.grandTotal).toBe(10_855_000)
      expect(slipOf(view.result, h.anId).due).toBe(2_600_000)
      expect(slipOf(view.result, h.binhId).due).toBe(2_680_000)
      expect(slipOf(view.result, h.chiId).due).toBe(2_575_000)
      expect(slipOf(view.result, h.linhId)).toMatchObject({ share: 2_800_000, due: null, advanced: 120_000 })
      expect(view.members.map((m) => m.memberId)).toEqual([h.linhId, h.anId, h.binhId, h.chiId])
      // thành viên xem được tháng đã chốt
      const asAn = await getPeriodView(db, h.an, h.periodId)
      expect(slipOf(asAn.result, h.anId).due).toBe(2_600_000)
    })

    it('previewPeriod tháng nháp ra đúng số trước khi chốt, không ghi gì vào DB', async () => {
      const h = await draft54()
      const preview = await previewPeriod(db, h.linh, h.periodId)
      expect(preview.grandTotal).toBe(10_855_000)
      expect(slipOf(preview, h.chiId).due).toBe(2_575_000)
      const row = await periodRow(h.periodId)
      expect(row.status).toBe('draft')
      expect(row.result).toBeNull()
    })

    it('buildPeriodInput lấy từ bản chụp của tháng (khoản, số lượng xe, ngày ở, khoản chi)', async () => {
      const h = await draft54()
      const input = await buildPeriodInput(db, h.periodId)
      expect(input).toMatchObject({ year: 2026, month: 11, daysInMonth: 30 })
      expect(input.items.map((i) => [i.name, i.kind, i.amount, i.enabled])).toEqual([
        ['Tiền nhà', 'equal', 8_000_000, true],
        ['Phí dịch vụ', 'equal', 600_000, true],
        ['Xe', 'per_unit', 120_000, true],
      ])
      const xeId = input.items[2].id
      expect(input.members.map((m) => [m.name, m.isOwner, m.included, m.days, m.qty[xeId] ?? 0])).toEqual([
        ['Linh', true, true, 30, 1],
        ['An', false, true, 30, 1],
        ['Bình', false, true, 30, 0],
        ['Chi', false, true, 15, 1],
      ])
      expect(input.electricity).toEqual({ mode: 'total', total: 1_260_000 })
      expect(input.expenses.map((e) => e.amount)).toEqual([200_000, 120_000])
    })
  })

  describe('bản chụp cấu hình', () => {
    it('tháng nháp: đổi giá tiền nhà trong cài đặt → previewPeriod phản ánh giá mới', async () => {
      const h = await draft54()
      await upsertChargeItem(db, h.linh, h.houseId, { id: h.items.nha, name: 'Tiền nhà', kind: 'equal', amount: 9_000_000, active: true })
      const preview = await previewPeriod(db, h.linh, h.periodId)
      expect(preview.grandTotal).toBe(11_855_000)
      expect(slipOf(preview, h.binhId).due).toBe(2_930_000)
    })

    it('tháng nháp: đồng bộ giữ nguyên số đã nhập (ngày ở, tính tháng này, công tắc khoản, số điện nước)', async () => {
      const h = await draft54()
      const dvRow = (await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId))).find((i) => i.sourceItemId === h.items.dv)!
      await setPeriodItemEnabled(db, h.linh, dvRow.id, false)
      await setPeriodMember(db, h.linh, h.periodId, h.binhId, { included: false })
      await upsertChargeItem(db, h.linh, h.houseId, { id: h.items.dv, name: 'Phí DV', kind: 'equal', amount: 900_000, active: true })
      await setUtilityTariff(db, h.linh, h.houseId, 'water', { mode: 'total', tariff: null })
      const input = await buildPeriodInput(db, h.periodId)
      expect(input.items.find((i) => i.id === dvRow.id)).toMatchObject({ name: 'Phí DV', amount: 900_000, enabled: false })
      expect(input.members.find((m) => m.memberId === h.binhId)!.included).toBe(false)
      expect(input.members.find((m) => m.memberId === h.chiId)!.days).toBe(15)
      expect(input.electricity).toEqual({ mode: 'total', total: 1_260_000 })
      expect(input.water).toEqual({ mode: 'total', total: 315_000 })
    })

    it('tháng nháp: khoản bị gỡ biến mất, khoản mới xuất hiện (bật), số lượng xe và hạn đóng theo cài đặt mới', async () => {
      const h = await draft54()
      await deleteChargeItem(db, h.linh, h.items.dv)
      const rac = await upsertChargeItem(db, h.linh, h.houseId, { name: 'Rác', kind: 'equal', amount: 40_000, active: true })
      await setMemberQty(db, h.linh, h.binhId, h.items.xe, 2)
      await setDueDay(db, h.linh, h.houseId, 5)
      const input = await buildPeriodInput(db, h.periodId)
      expect(input.items.map((i) => i.name)).toEqual(['Tiền nhà', 'Xe', 'Rác'])
      const xeId = input.items[1].id
      expect(input.members.find((m) => m.memberId === h.binhId)!.qty[xeId]).toBe(2)
      const rows = await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId))
      expect(rows.find((r) => r.sourceItemId === rac)!.enabled).toBe(true)
      expect((await periodRow(h.periodId)).dueDate).toBe('2026-12-05')
    })

    it('tháng đã chốt: đổi giá tiền nhà, gỡ khoản, đổi chế độ điện trong cài đặt → getPeriodView KHÔNG đổi', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const before = await getPeriodView(db, h.linh, h.periodId)
      const rowsBefore = await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId))
      await upsertChargeItem(db, h.linh, h.houseId, { id: h.items.nha, name: 'Tiền nhà', kind: 'equal', amount: 9_000_000, active: true })
      await deleteChargeItem(db, h.linh, h.items.dv)
      await setMemberQty(db, h.linh, h.binhId, h.items.xe, 3)
      await setUtilityTariff(db, h.linh, h.houseId, 'electricity', { mode: 'tiered', tariff: ELEC_TARIFF })
      await setDueDay(db, h.linh, h.houseId, 3)
      const after = await getPeriodView(db, h.linh, h.periodId)
      expect(after).toEqual(before)
      expect(after.result.grandTotal).toBe(10_855_000)
      const rowsAfter = await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId))
      expect(rowsAfter).toEqual(rowsBefore)
      // sửa sau chốt vẫn tính bằng bản chụp của tháng (tiền nhà 8tr, điện "Nhập tổng"), không dùng cấu hình mới
      await setUtilityReading(db, h.linh, h.periodId, 'water', { total: 420_000 })
      const edited = await getPeriodView(db, h.linh, h.periodId)
      expect(edited.result.grandTotal).toBe(10_855_000 + 105_000)
      expect(slipOf(edited.result, h.binhId).due).toBe(2_680_000 + 30_000)
      expect(edited.utilities.electricity.mode).toBe('total')
      expect(edited.items.find((i) => i.name === 'Tiền nhà')!.amount).toBe(8_000_000)
    })
  })

  describe('chỉ số điện nước', () => {
    async function tieredHouse() {
      const h = await house54()
      await setUtilityTariff(db, h.linh, h.houseId, 'electricity', { mode: 'tiered', tariff: ELEC_TARIFF })
      return h
    }

    it('tạo tháng 12 sau khi tháng 11 chốt: prev điện tháng 12 = curr điện tháng 11', async () => {
      const h = await tieredHouse()
      const { periodId: p11 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      await setUtilityReading(db, h.linh, p11, 'electricity', { prev: 1238, curr: 1398 })
      await setUtilityReading(db, h.linh, p11, 'water', { total: 315_000 })
      await closePeriod(db, h.linh, p11)
      expect((await getPeriodView(db, h.linh, p11)).result.electricity).toMatchObject({ usage: 160, total: 560_000 })
      const { periodId: p12 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T12)
      const v12 = await getPeriodView(db, h.linh, p12)
      expect(v12.utilities.electricity).toMatchObject({ mode: 'tiered', prev: 1398, curr: null })
      expect(v12.utilities.water).toMatchObject({ mode: 'total', prev: null, total: null })
    })

    it('nhập chỉ số cuối tháng trước sau khi tháng sau đã có nháp → tự điền chỉ số đầu tháng sau', async () => {
      const h = await tieredHouse()
      const { periodId: p11 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      const { periodId: p12 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T12)
      await setUtilityReading(db, h.linh, p11, 'electricity', { prev: 1000, curr: 1100 })
      expect((await getPeriodView(db, h.linh, p12)).utilities.electricity.prev).toBe(1100)
      // chủ nhà đã tự sửa chỉ số đầu tháng 12 thì không ghi đè
      await setUtilityReading(db, h.linh, p12, 'electricity', { prev: 1105 })
      await setUtilityReading(db, h.linh, p11, 'electricity', { curr: 1102 })
      expect((await getPeriodView(db, h.linh, p12)).utilities.electricity.prev).toBe(1105)
    })

    it('curr < prev → INVALID READING_DECREASED (Review Focus #2), không lưu', async () => {
      const h = await tieredHouse()
      const { periodId } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      await expectApp(setUtilityReading(db, h.linh, periodId, 'electricity', { prev: 464, curr: 452 }), 'INVALID', 'READING_DECREASED')
      await setUtilityReading(db, h.linh, periodId, 'electricity', { prev: 452, curr: 464 })
      await expectApp(setUtilityReading(db, h.linh, periodId, 'electricity', { curr: 451 }), 'INVALID', 'READING_DECREASED')
      await expectApp(setUtilityReading(db, h.linh, periodId, 'electricity', { prev: 465 }), 'INVALID', 'READING_DECREASED')
      expect((await getPeriodView(db, h.linh, periodId)).utilities.electricity).toMatchObject({ prev: 452, curr: 464 })
    })

    it('chỉ số âm, lẻ, tổng tiền âm hoặc quá lớn, loại tiện ích lạ → INVALID', async () => {
      const h = await house54()
      const { periodId } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      await expectApp(setUtilityReading(db, h.linh, periodId, 'electricity', { curr: -1 }), 'INVALID', 'READING_INVALID')
      await expectApp(setUtilityReading(db, h.linh, periodId, 'electricity', { curr: 1.5 }), 'INVALID', 'READING_INVALID')
      await expectApp(setUtilityReading(db, h.linh, periodId, 'water', { total: -1 }), 'INVALID', 'AMOUNT_INVALID')
      await expectApp(setUtilityReading(db, h.linh, periodId, 'water', { total: 1.5 }), 'INVALID', 'AMOUNT_INVALID')
      await expectApp(setUtilityReading(db, h.linh, periodId, 'water', { total: 100_000_000_001 }), 'INVALID', 'AMOUNT_INVALID')
      await expectApp(setUtilityReading(db, h.linh, periodId, 'gas' as 'water', { total: 1 }), 'INVALID', 'UTILITY')
    })
  })

  describe('chốt sổ', () => {
    it('chưa nhập điện hoặc nước → INVALID UTILITY_MISSING (tên tiện ích trong câu báo), không chốt', async () => {
      const h = await house54()
      await setUtilityTariff(db, h.linh, h.houseId, 'electricity', { mode: 'tiered', tariff: ELEC_TARIFF })
      const { periodId } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      await setUtilityReading(db, h.linh, periodId, 'water', { total: 315_000 })
      const err = await closePeriod(db, h.linh, periodId).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).reason).toBe('UTILITY_MISSING')
      expect((err as AppError).message).toMatch(/Điện/)
      await setUtilityReading(db, h.linh, periodId, 'electricity', { prev: 100 })
      await expectApp(closePeriod(db, h.linh, periodId), 'INVALID', 'UTILITY_MISSING')
      await setUtilityReading(db, h.linh, periodId, 'electricity', { curr: 160 })
      await closePeriod(db, h.linh, periodId)
      expect((await periodRow(periodId)).status).toBe('closed')
    })

    it('chốt hai lần → CONFLICT PERIOD_CLOSED; onPeriodClosed được gọi đúng 1 lần sau khi lưu', async () => {
      const h = await draft54()
      const spy = vi.spyOn(events, 'onPeriodClosed')
      await closePeriod(db, h.linh, h.periodId)
      await expectApp(closePeriod(db, h.linh, h.periodId), 'CONFLICT', 'PERIOD_CLOSED')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][1]).toBe(h.periodId)
    })

    it('getOrCreateDraftPeriod: cùng tháng trả cùng id (kể cả gọi đồng thời); tháng đã chốt → CONFLICT PERIOD_CLOSED', async () => {
      const h = await draft54()
      const [a, b] = await Promise.all([
        getOrCreateDraftPeriod(db, h.linh, h.houseId, T12),
        getOrCreateDraftPeriod(db, h.linh, h.houseId, T12),
      ])
      expect(a.periodId).toBe(b.periodId)
      expect((await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)).periodId).toBe(h.periodId)
      await closePeriod(db, h.linh, h.periodId)
      await expectApp(getOrCreateDraftPeriod(db, h.linh, h.houseId, T11), 'CONFLICT', 'PERIOD_CLOSED')
      await expectApp(getOrCreateDraftPeriod(db, h.linh, h.houseId, { year: 2026, month: 13 }), 'INVALID')
    })
  })

  describe('thành viên', () => {
    it('thành viên bị removeMember sau khi chốt → getPeriodView vẫn có phiếu của người đó (Review Focus #4)', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      await removeMember(db, h.linh, h.houseId, h.chiId)
      const view = await getPeriodView(db, h.linh, h.periodId)
      expect(slipOf(view.result, h.chiId).due).toBe(2_575_000)
      expect(view.members.find((m) => m.memberId === h.chiId)!.name).toBe('Chi')
      // sửa sau chốt vẫn giữ người đã rời trong phép tính
      await setUtilityReading(db, h.linh, h.periodId, 'water', { total: 420_000 })
      const edited = await getPeriodView(db, h.linh, h.periodId)
      expect(slipOf(edited.result, h.chiId).due).toBe(2_575_000 + 15_000)
    })

    it('người đã rời/bị xóa: xem lại (chỉ đọc) đúng các tháng đã chốt có tên mình; tháng nháp và tháng sau khi rời thì không', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      await removeMember(db, h.linh, h.houseId, h.chiId)
      const view = await getPeriodView(db, h.chi, h.periodId)
      expect(view.viewer).toEqual({ memberId: h.chiId, role: 'member', former: true })
      expect(slipOf(view.result, h.chiId).due).toBe(2_575_000)
      expect((await listPeriods(db, h.chi, h.houseId)).map((p) => p.id)).toEqual([h.periodId])

      // tháng 12 tạo sau khi Chi rời: không có tên Chi, kể cả khi đã chốt
      const { periodId: t12 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T12)
      await expectApp(getPeriodView(db, h.chi, t12), 'FORBIDDEN', 'NOT_MEMBER')
      await setUtilityReading(db, h.linh, t12, 'electricity', { total: 0 })
      await setUtilityReading(db, h.linh, t12, 'water', { total: 0 })
      await closePeriod(db, h.linh, t12)
      await expectApp(getPeriodView(db, h.chi, t12), 'FORBIDDEN', 'NOT_MEMBER')
      expect((await listPeriods(db, h.chi, h.houseId)).map((p) => p.id)).toEqual([h.periodId])

      // không ghi được gì
      await expectApp(setPeriodMember(db, h.chi, h.periodId, h.chiId, { days: 1 }), 'FORBIDDEN', 'NOT_MEMBER')
      // thành viên đang ở thì vẫn như cũ
      expect((await getPeriodView(db, h.an, h.periodId)).viewer).toEqual({ memberId: h.anId, role: 'member', former: false })
      expect((await getPeriodView(db, h.linh, t12)).viewer).toEqual({ memberId: h.linhId, role: 'owner', former: false })
    })

    it('thành viên mới vào nhà → có mặt trong tháng nháp (đủ ngày, được tính), không có trong tháng đã chốt', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const { periodId: p12 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T12)
      const dung = await newUser('Dũng')
      const dungId = await join(h.houseId, dung)
      const v12 = await getPeriodView(db, h.linh, p12)
      expect(v12.members.find((m) => m.memberId === dungId)).toMatchObject({ name: 'Dũng', included: true, days: 31, isOwner: false })
      expect(v12.members.map((m) => m.memberId).at(-1)).toBe(dungId)
      const v11 = await getPeriodView(db, h.linh, h.periodId)
      expect(v11.members.map((m) => m.memberId)).not.toContain(dungId)
      expect(v11.result.payslips.map((p) => p.memberId)).not.toContain(dungId)
    })

    it('người đã rời nay vào lại → dòng cũ trong tháng nháp tắt "Tính tháng này" (giữ ngày ở), chỉ tính một lần', async () => {
      const h = await draft54()
      await removeMember(db, h.linh, h.houseId, h.chiId)
      const newChiId = await join(h.houseId, h.chi)
      const view = await getPeriodView(db, h.linh, h.periodId)
      expect(view.members.find((m) => m.memberId === h.chiId)).toMatchObject({ included: false, days: 15 })
      expect(view.members.find((m) => m.memberId === newChiId)).toMatchObject({ included: true, days: 30, name: 'Chi' })
      expect(view.members.filter((m) => m.included)).toHaveLength(4)
      // M = 4 như cũ: Bình vẫn 2.000.000 tiền nhà; Σd = 30 × 4 = 120
      const binhNha = view.result.payslips.find((p) => p.memberId === h.binhId)!.lines.find((l) => l.label === 'Tiền nhà')!
      expect(binhNha.amount).toBe(2_000_000)
      const binhDien = view.result.payslips.find((p) => p.memberId === h.binhId)!.lines.find((l) => l.key === 'electricity')!
      expect(binhDien.amount).toBe(1_260_000 * 30 / 120)
      expect(view.result.payslips.map((p) => p.memberId)).not.toContain(h.chiId)
    })

    it('setPeriodMember: ngày ở 0..số ngày của tháng; thành viên không thuộc tháng → NOT_FOUND', async () => {
      const h = await house54()
      const { periodId } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      await setPeriodMember(db, h.linh, periodId, h.anId, { days: 0 })
      await setPeriodMember(db, h.linh, periodId, h.anId, { days: 30 })
      await expectApp(setPeriodMember(db, h.linh, periodId, h.anId, { days: 31 }), 'INVALID', 'DAYS_INVALID')
      await expectApp(setPeriodMember(db, h.linh, periodId, h.anId, { days: -1 }), 'INVALID', 'DAYS_INVALID')
      await expectApp(setPeriodMember(db, h.linh, periodId, h.anId, { days: 2.5 }), 'INVALID', 'DAYS_INVALID')
      await expectApp(setPeriodMember(db, h.linh, periodId, newId(), { days: 3 }), 'NOT_FOUND')
    })
  })

  describe('sửa sau khi chốt', () => {
    it('tắt "Tính tháng này" cho người ĐÃ TRẢ sau khi chốt → vẫn có phiếu share 0, "Chủ nhà nợ", trả lại được, còn nợ tới khi trả lại', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const { paymentId } = await submitTransfer(db, h.binh, h.periodId, {})
      await confirmPayment(db, h.linh, paymentId)
      expect(await hasOutstandingBalance(db, h.houseId, h.binhId)).toBe(false)

      await setPeriodMember(db, h.linh, h.periodId, h.binhId, { included: false })
      const view = await getPeriodView(db, h.linh, h.periodId)
      expect(slipOf(view.result, h.binhId)).toMatchObject({ share: 0, advanced: 0, due: 0, lines: [] })
      expect(view.result.payslips.reduce((s, p) => s + p.share, 0)).toBe(view.result.grandTotal)

      // Bình đã trả đủ 2.680.000 rồi bị bỏ khỏi tháng → chủ nhà nợ Bình 2.680.000
      const statuses = await getStatuses(db, h.periodId)
      expect(statuses[h.binhId]).toMatchObject({ kind: 'owner_owes', balance: -2_680_000 })
      const rows = paymentRows({
        status: 'closed',
        dueDate: view.period.dueDate,
        payslips: view.result.payslips,
        names: new Map(view.members.map((m) => [m.memberId, m.name])),
        statuses,
        now: new Date(),
      })
      expect(rows.find((r) => r.memberId === h.binhId)?.pill).toEqual({ tone: 'unpaid', text: 'Chủ nhà nợ 2.680.000 đ' })
      expect(await hasOutstandingBalance(db, h.houseId, h.binhId)).toBe(true)
      await expectApp(leaveHouse(db, h.binh, h.houseId), 'CONFLICT', 'HAS_BALANCE')

      await recordRefund(db, h.linh, h.periodId, h.binhId, 2_680_000)
      expect((await getStatuses(db, h.periodId))[h.binhId]).toMatchObject({ kind: 'paid', balance: 0 })
      expect(await hasOutstandingBalance(db, h.houseId, h.binhId)).toBe(false)
    })

    it('mỗi thao tác sửa → revision tăng 1, result tính lại, onPeriodUpdated gọi đúng 1 lần', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const spy = vi.spyOn(events, 'onPeriodUpdated')

      await setUtilityReading(db, h.linh, h.periodId, 'electricity', { total: 1_365_000 })
      let row = await periodRow(h.periodId)
      expect(row.revision).toBe(1)
      expect(slipOf(row.result!, h.binhId).due).toBe(2_680_000 + 30_000)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][1]).toBe(h.periodId)

      await setPeriodMember(db, h.linh, h.periodId, h.chiId, { days: 30 })
      const dv = (await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId))).find((i) => i.sourceItemId === h.items.dv)!
      await setPeriodItemEnabled(db, h.linh, dv.id, false)
      row = await periodRow(h.periodId)
      expect(row.revision).toBe(3)
      expect(row.status).toBe('closed')
      expect(spy).toHaveBeenCalledTimes(3)
      expect(row.result).toEqual(await previewPeriod(db, h.linh, h.periodId))
    })

    it('ghi lại đúng giá trị cũ (hoặc patch rỗng) → revision giữ nguyên, không gọi onPeriodUpdated', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const before = await getPeriodView(db, h.linh, h.periodId)
      const dv = (await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId))).find((i) => i.sourceItemId === h.items.dv)!
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await setUtilityReading(db, h.linh, h.periodId, 'water', { total: 315_000 })
      await setUtilityReading(db, h.linh, h.periodId, 'electricity', {})
      await setPeriodMember(db, h.linh, h.periodId, h.chiId, { days: 15, included: true })
      await setPeriodMember(db, h.linh, h.periodId, h.chiId, {})
      await setPeriodItemEnabled(db, h.linh, dv.id, true)
      expect((await periodRow(h.periodId)).revision).toBe(0)
      expect(spy).not.toHaveBeenCalled()
      expect(await getPeriodView(db, h.linh, h.periodId)).toEqual(before)
    })

    it('sửa số liệu không làm phiếu đổi (ngày ở của người không được tính) → lưu nhưng không tăng revision, không báo', async () => {
      const h = await draft54()
      await setPeriodMember(db, h.linh, h.periodId, h.binhId, { included: false })
      await closePeriod(db, h.linh, h.periodId)
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await setPeriodMember(db, h.linh, h.periodId, h.binhId, { days: 10 })
      expect((await periodRow(h.periodId)).revision).toBe(0)
      expect(spy).not.toHaveBeenCalled()
      expect((await getPeriodView(db, h.linh, h.periodId)).members.find((m) => m.memberId === h.binhId)!.days).toBe(10)
    })

    it('thao tác sửa bị từ chối → revision giữ nguyên, không gọi onPeriodUpdated', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await expectApp(setUtilityReading(db, h.linh, h.periodId, 'water', { total: null }), 'INVALID', 'UTILITY_MISSING')
      for (const m of [h.linhId, h.anId, h.binhId]) await setPeriodMember(db, h.linh, h.periodId, m, { included: false })
      expect((await periodRow(h.periodId)).revision).toBe(3)
      await expectApp(setPeriodMember(db, h.linh, h.periodId, h.chiId, { included: false }), 'INVALID', 'NO_MEMBERS')
      expect((await periodRow(h.periodId)).revision).toBe(3)
      expect(spy).toHaveBeenCalledTimes(3)
    })

    it('tháng nháp: sửa không đổi revision, không gọi onPeriodUpdated', async () => {
      const h = await draft54()
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await setUtilityReading(db, h.linh, h.periodId, 'water', { total: 1 })
      expect((await periodRow(h.periodId)).revision).toBe(0)
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('sửa nhiều số liệu một lần (applyPeriodEdits)', () => {
    async function itemsOf(periodId: string) {
      return db.select().from(periodItems).where(eq(periodItems.periodId, periodId))
    }

    it('tháng nháp: ghi điện, nước, ngày ở, công tắc khoản trong một lần → preview ra đúng §5.4', async () => {
      const h = await house54()
      const { periodId } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T11)
      await addExpense(db, h.linh, h.houseId, { description: 'Nước giặt', amount: 200_000, spentOn: '2026-11-05', paidByMemberId: h.anId })
      await addExpense(db, h.linh, h.houseId, { description: 'Giấy', amount: 120_000, spentOn: '2026-11-12', paidByMemberId: h.linhId })
      const dv = (await itemsOf(periodId)).find((i) => i.sourceItemId === h.items.dv)!
      await applyPeriodEdits(db, h.linh, periodId, {
        utilities: { electricity: { total: 1_260_000 }, water: { total: 315_000 } },
        members: [{ memberId: h.chiId, days: 15 }],
        items: [{ itemId: dv.id, enabled: false }],
      })
      await applyPeriodEdits(db, h.linh, periodId, { items: [{ itemId: dv.id, enabled: true }] })
      const preview = await previewPeriod(db, h.linh, periodId)
      expect(preview.grandTotal).toBe(10_855_000)
      expect([h.anId, h.binhId, h.chiId].map((m) => slipOf(preview, m).due)).toEqual([2_600_000, 2_680_000, 2_575_000])
      expect((await periodRow(periodId)).revision).toBe(0)
    })

    it('tháng đã chốt: nhiều thay đổi → revision tăng đúng 1, onPeriodUpdated gọi đúng 1 lần', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await applyPeriodEdits(db, h.linh, h.periodId, {
        utilities: { electricity: { total: 1_365_000 } },
        members: [{ memberId: h.chiId, days: 30 }],
      })
      const row = await periodRow(h.periodId)
      expect(row.revision).toBe(1)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(row.result).toEqual(await previewPeriod(db, h.linh, h.periodId))
    })

    it('không đổi gì (giá trị cũ hoặc rỗng) → không tăng revision, không báo', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await applyPeriodEdits(db, h.linh, h.periodId, {})
      await applyPeriodEdits(db, h.linh, h.periodId, { utilities: { water: { total: 315_000 } }, members: [{ memberId: h.chiId, days: 15 }] })
      expect((await periodRow(h.periodId)).revision).toBe(0)
      expect(spy).not.toHaveBeenCalled()
    })

    it('một phần sai → cả lần sửa bị từ chối, không ghi gì', async () => {
      const h = await draft54()
      await expectApp(
        applyPeriodEdits(db, h.linh, h.periodId, {
          utilities: { water: { total: 1 } },
          members: [{ memberId: h.chiId, days: 31 }],
        }),
        'INVALID',
        'DAYS_INVALID',
      )
      const view = await getPeriodView(db, h.linh, h.periodId)
      expect(view.utilities.water.total).toBe(315_000)
      expect(view.members.find((m) => m.memberId === h.chiId)!.days).toBe(15)
    })

    it('expect draft (lưu tự động): tháng vừa bị chốt → CONFLICT PERIOD_CLOSED, không ghi, không tăng revision, không báo', async () => {
      const h = await draft54()
      await applyPeriodEdits(db, h.linh, h.periodId, { utilities: { water: { total: 316_000 } } }, { expect: 'draft' })
      await closePeriod(db, h.linh, h.periodId)
      const spy = vi.spyOn(events, 'onPeriodUpdated')
      await expectApp(
        applyPeriodEdits(db, h.linh, h.periodId, { utilities: { water: { total: 999_000 } } }, { expect: 'draft' }),
        'CONFLICT',
        'PERIOD_CLOSED',
      )
      const row = await periodRow(h.periodId)
      expect(row.revision).toBe(0)
      expect(spy).not.toHaveBeenCalled()
      expect((await getPeriodView(db, h.linh, h.periodId)).utilities.water.total).toBe(316_000)
    })

    it('khoản của tháng khác → NOT_FOUND; dữ liệu sai kiểu → INVALID; thành viên → FORBIDDEN', async () => {
      const h = await draft54()
      const { periodId: t12 } = await getOrCreateDraftPeriod(db, h.linh, h.houseId, T12)
      const other = (await itemsOf(t12))[0]
      await expectApp(applyPeriodEdits(db, h.linh, h.periodId, { items: [{ itemId: other.id, enabled: false }] }), 'NOT_FOUND', 'ITEM_NOT_FOUND')
      await expectApp(
        applyPeriodEdits(db, h.linh, h.periodId, { members: 'x' } as unknown as Parameters<typeof applyPeriodEdits>[3]),
        'INVALID',
        'EDITS_INVALID',
      )
      await expectApp(applyPeriodEdits(db, h.an, h.periodId, { utilities: { water: { total: 1 } } }), 'FORBIDDEN', 'NOT_OWNER')
      expect((await itemsOf(t12)).find((i) => i.id === other.id)!.enabled).toBe(true)
    })
  })

  describe('getPeriodEditor', () => {
    it('chủ nhà đọc được bản chụp cả khi tháng nháp chưa tính được (NO_MEMBERS); thành viên → FORBIDDEN', async () => {
      const h = await draft54()
      for (const m of [h.linhId, h.anId, h.binhId, h.chiId]) await setPeriodMember(db, h.linh, h.periodId, m, { included: false })
      await expectApp(previewPeriod(db, h.linh, h.periodId), 'INVALID', 'NO_MEMBERS')
      const ed = await getPeriodEditor(db, h.linh, h.periodId)
      expect(ed.period).toMatchObject({ id: h.periodId, houseId: h.houseId, month: 11, status: 'draft' })
      expect(ed.members.map((m) => m.included)).toEqual([false, false, false, false])
      expect(ed.utilities.electricity).toMatchObject({ mode: 'total', total: 1_260_000 })
      expect(ed.expenses).toHaveLength(2)
      expect(ed.items.map((i) => i.name)).toEqual(['Tiền nhà', 'Phí dịch vụ', 'Xe'])
      await expectApp(getPeriodEditor(db, h.an, h.periodId), 'FORBIDDEN', 'NOT_OWNER')
    })
  })

  describe('phân quyền (Review Focus #5)', () => {
    it('thành viên gọi các hàm ghi của chủ nhà → FORBIDDEN, không đổi gì', async () => {
      const h = await draft54()
      const item = (await db.select().from(periodItems).where(eq(periodItems.periodId, h.periodId)))[0]
      await expectApp(closePeriod(db, h.an, h.periodId), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setUtilityReading(db, h.an, h.periodId, 'water', { total: 1 }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setPeriodMember(db, h.an, h.periodId, h.anId, { days: 1 }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setPeriodItemEnabled(db, h.an, item.id, false), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(previewPeriod(db, h.an, h.periodId), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(getOrCreateDraftPeriod(db, h.an, h.houseId, T12), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(
        addExpense(db, h.an, h.houseId, { description: 'X', amount: 1_000, spentOn: '2026-11-20', paidByMemberId: h.anId }),
        'FORBIDDEN',
        'NOT_OWNER',
      )
      expect(await previewPeriod(db, h.linh, h.periodId)).toMatchObject({ grandTotal: 10_855_000 })
      expect((await periodRow(h.periodId)).status).toBe('draft')
      expect(await db.select().from(periods).where(and(eq(periods.houseId, h.houseId), eq(periods.month, 12)))).toEqual([])
    })

    it('thành viên sửa tháng đã chốt → FORBIDDEN, revision giữ nguyên', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      await expectApp(setUtilityReading(db, h.an, h.periodId, 'water', { total: 1 }), 'FORBIDDEN')
      await expectApp(setPeriodMember(db, h.an, h.periodId, h.anId, { days: 1 }), 'FORBIDDEN')
      expect((await periodRow(h.periodId)).revision).toBe(0)
    })

    it('người ngoài nhà không đọc, không ghi được', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      const stranger = await newUser('Lạ')
      await expectApp(getPeriodView(db, stranger, h.periodId), 'FORBIDDEN')
      await expectApp(listPeriods(db, stranger, h.houseId), 'FORBIDDEN')
      await expectApp(setUtilityReading(db, stranger, h.periodId, 'water', { total: 1 }), 'FORBIDDEN')
      await expectApp(getPeriodView(db, stranger, newId()), 'NOT_FOUND')
    })

    it('thành viên xem tháng nháp → FORBIDDEN; tháng đã chốt → OK; listPeriods của thành viên bỏ tháng nháp', async () => {
      const h = await draft54()
      await expectApp(getPeriodView(db, h.an, h.periodId), 'FORBIDDEN', 'PERIOD_DRAFT')
      await closePeriod(db, h.linh, h.periodId)
      await getOrCreateDraftPeriod(db, h.linh, h.houseId, T12)
      expect((await getPeriodView(db, h.an, h.periodId)).period.status).toBe('closed')
      expect(await listPeriods(db, h.an, h.houseId)).toEqual([
        { id: h.periodId, year: 2026, month: 11, status: 'closed', grandTotal: 10_855_000 },
      ])
      const all = await listPeriods(db, h.linh, h.houseId)
      expect(all.map((p) => [p.month, p.status, p.grandTotal])).toEqual([
        [12, 'draft', null],
        [11, 'closed', 10_855_000],
      ])
    })

    it('nhà đã lưu trữ: chủ nhà không ghi được, cả nhà vẫn xem được tháng đã chốt', async () => {
      const h = await draft54()
      await closePeriod(db, h.linh, h.periodId)
      await archiveHouse(db, h.linh, h.houseId, { force: true })
      await expectApp(setUtilityReading(db, h.linh, h.periodId, 'water', { total: 1 }), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(getOrCreateDraftPeriod(db, h.linh, h.houseId, T10), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      expect((await getPeriodView(db, h.an, h.periodId)).result.grandTotal).toBe(10_855_000)
    })
  })
})
