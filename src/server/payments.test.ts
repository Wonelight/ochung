import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { houseMembers, payments, periods, user } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { proofPathPrefix } from '@/lib/proof'
import { MAX_MONEY } from '@/lib/validation'
import type { Actor } from './actor'
import { addMemberTx, archiveHouse, createHouse, isUniqueViolation, leaveHouse } from './houses'
import {
  authorizeProofUpload,
  confirmPayment,
  getStatuses,
  hasOutstandingBalance,
  recordCashPayment,
  recordRefund,
  rejectPayment,
  submitTransfer,
} from './payments'

describe('thanh toán', () => {
  let db: Db
  let seq = 0

  beforeAll(async () => {
    db = await createTestDb()
  }, 30_000)

  async function newUser(name: string): Promise<Actor> {
    const n = seq++
    const id = newId()
    await db.insert(user).values({ id, name, email: `p${n}@nha.local`, accountCode: `P-${String(n).padStart(5, '0')}` })
    return { userId: id, role: 'user' }
  }

  /** Nhà có chủ nhà + An + Bình; tháng 10 đã chốt: An cần chuyển 2.600.000, Bình 1.000.000. */
  async function setup(dues: { an?: number; binh?: number } = {}) {
    const owner = await newUser('Chủ')
    const an = await newUser('An')
    const binh = await newUser('Bình')
    const { houseId } = await createHouse(db, owner, { name: 'Nhà Cầu Giấy' })
    const anRow = (await db.transaction((tx) => addMemberTx(tx, houseId, an.userId))).id
    const binhRow = (await db.transaction((tx) => addMemberTx(tx, houseId, binh.userId))).id
    const [ownerRow] = await db.select({ id: houseMembers.id }).from(houseMembers).where(eq(houseMembers.userId, owner.userId))
    const anDue = dues.an ?? 2_600_000
    const binhDue = dues.binh ?? 1_000_000
    const periodId = await closed(houseId, 10, [
      { memberId: ownerRow.id, due: null, share: 500_000 },
      { memberId: anRow, due: anDue, share: anDue },
      { memberId: binhRow, due: binhDue, share: binhDue },
    ])
    return { owner, an, binh, houseId, anRow, binhRow, ownerRow: ownerRow.id, periodId }
  }

  async function closed(houseId: string, month: number, slips: { memberId: string; due: number | null; share: number }[]) {
    const id = newId()
    await db.insert(periods).values({
      id,
      houseId,
      year: 2026,
      month,
      status: 'closed',
      dueDate: '2026-11-10',
      closedAt: new Date(),
      result: {
        electricity: null,
        water: null,
        grandTotal: slips.reduce((s, x) => s + x.share, 0),
        payslips: slips.map((s) => ({ memberId: s.memberId, lines: [], share: s.share, advanced: 0, due: s.due })),
      },
    })
    return id
  }

  /** Sửa sau chốt: ghi đè số cần chuyển của một người (mô phỏng recompute). */
  async function setDue(periodId: string, memberId: string, due: number) {
    const [p] = await db.select({ result: periods.result }).from(periods).where(eq(periods.id, periodId))
    const result = p.result!
    await db
      .update(periods)
      .set({ result: { ...result, payslips: result.payslips.map((s) => (s.memberId === memberId ? { ...s, due, share: due } : s)) } })
      .where(eq(periods.id, periodId))
  }

  async function rejects(p: Promise<unknown>, code: AppError['code'], reason?: string) {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe(code)
    if (reason) expect((err as AppError).reason).toBe(reason)
  }

  const rowsOf = async (periodId: string, memberId: string) =>
    (await db.select().from(payments).where(eq(payments.periodId, periodId))).filter((x) => x.memberId === memberId)

  describe('submitTransfer', () => {
    it('tạo bản ghi pending bằng số cần chuyển hiện tại, trạng thái Chờ xác nhận', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      const [row] = await rowsOf(s.periodId, s.anRow)
      expect(row).toMatchObject({ id: paymentId, direction: 'in', status: 'pending', amount: 2_600_000, createdBy: s.an.userId, proofUrl: null })
      const st = (await getStatuses(db, s.periodId))[s.anRow]
      expect(st).toMatchObject({ kind: 'pending', balance: 2_600_000, confirmedIn: 0 })
    })

    it('gọi hai lần (kể cả đồng thời) → đúng một bản ghi pending, cùng paymentId', async () => {
      const s = await setup()
      const first = await submitTransfer(db, s.an, s.periodId, {})
      const second = await submitTransfer(db, s.an, s.periodId, {})
      expect(second.paymentId).toBe(first.paymentId)
      const [x, y] = await Promise.all([submitTransfer(db, s.binh, s.periodId, {}), submitTransfer(db, s.binh, s.periodId, {})])
      expect(x.paymentId).toBe(y.paymentId)
      expect(await rowsOf(s.periodId, s.anRow)).toHaveLength(1)
      expect(await rowsOf(s.periodId, s.binhRow)).toHaveLength(1)
    })

    it('tháng nháp → INVALID PERIOD_NOT_CLOSED', async () => {
      const s = await setup()
      const draftId = newId()
      await db.insert(periods).values({ id: draftId, houseId: s.houseId, year: 2026, month: 11, status: 'draft', dueDate: '2026-12-10' })
      await rejects(submitTransfer(db, s.an, draftId, {}), 'INVALID', 'PERIOD_NOT_CLOSED')
    })

    it('luôn dùng thành viên của người gọi; người ngoài nhà và chủ nhà (không có phần phải chuyển) không báo được', async () => {
      const s = await setup()
      await submitTransfer(db, s.binh, s.periodId, {})
      expect(await rowsOf(s.periodId, s.anRow)).toHaveLength(0)
      const [row] = await rowsOf(s.periodId, s.binhRow)
      expect(row.createdBy).toBe(s.binh.userId)
      await rejects(submitTransfer(db, await newUser('Người lạ'), s.periodId, {}), 'FORBIDDEN', 'NOT_MEMBER')
      await rejects(submitTransfer(db, s.owner, s.periodId, {}), 'CONFLICT', 'NOTHING_DUE')
    })

    it('không còn gì để trả (đã trả đủ, hoặc chủ nhà nợ) → CONFLICT NOTHING_DUE', async () => {
      const s = await setup({ an: 0, binh: -50_000 })
      await rejects(submitTransfer(db, s.an, s.periodId, {}), 'CONFLICT', 'NOTHING_DUE')
      await rejects(submitTransfer(db, s.binh, s.periodId, {}), 'CONFLICT', 'NOTHING_DUE')
    })

    it('chỉ báo số còn thiếu: đã được ghi một phần tiền mặt thì báo phần còn lại', async () => {
      const s = await setup()
      await recordCashPayment(db, s.owner, s.periodId, s.anRow, 1_000_000)
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      const [row] = await db.select().from(payments).where(eq(payments.id, paymentId))
      expect(row.amount).toBe(1_600_000)
    })

    it('ảnh chứng từ: chỉ nhận địa chỉ Blob đúng nhà/tháng/thành viên', async () => {
      const s = await setup()
      await rejects(submitTransfer(db, s.an, s.periodId, { proofUrl: 'https://evil.example.com/x.jpg' }), 'INVALID', 'PROOF_URL')
      const wrongMember = `https://x.public.blob.vercel-storage.com/${proofPathPrefix(s.houseId, s.periodId, s.binhRow)}a.jpg`
      await rejects(submitTransfer(db, s.an, s.periodId, { proofUrl: wrongMember }), 'INVALID', 'PROOF_URL')
      const ok = `https://x.public.blob.vercel-storage.com/${proofPathPrefix(s.houseId, s.periodId, s.anRow)}a-Zk3.jpg`
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, { proofUrl: ok })
      const [row] = await db.select().from(payments).where(eq(payments.id, paymentId))
      expect(row.proofUrl).toBe(ok)
    })

    it('chỉ mục duy nhất chặn khoản chờ thứ hai; vi phạm trong điểm lưu không làm hỏng transaction (đường lui của submitTransfer)', async () => {
      const s = await setup()
      const row = (id: string) => ({ id, periodId: s.periodId, memberId: s.anRow, direction: 'in' as const, amount: 1000, createdBy: s.an.userId })
      const count = await db.transaction(async (tx) => {
        await tx.insert(payments).values(row(newId()))
        let violated = false
        try {
          await tx.transaction((sp) => sp.insert(payments).values(row(newId())))
        } catch (e) {
          violated = isUniqueViolation(e)
        }
        expect(violated).toBe(true)
        return (await tx.select().from(payments).where(eq(payments.memberId, s.anRow))).length
      })
      expect(count).toBe(1)
    })

    it('nhà đã lưu trữ → FORBIDDEN HOUSE_ARCHIVED', async () => {
      const s = await setup()
      await archiveHouse(db, s.owner, s.houseId, { force: true })
      await rejects(submitTransfer(db, s.an, s.periodId, {}), 'FORBIDDEN', 'HOUSE_ARCHIVED')
    })
  })

  describe('authorizeProofUpload', () => {
    it('thành viên của nhà, tháng đã chốt → trả nhà và dòng thành viên của chính người gọi', async () => {
      const s = await setup()
      expect(await authorizeProofUpload(db, s.an, s.periodId)).toEqual({ houseId: s.houseId, memberId: s.anRow })
    })

    it('người ngoài nhà → FORBIDDEN; tháng nháp → PERIOD_NOT_CLOSED; tháng lạ → NOT_FOUND; nhà lưu trữ → FORBIDDEN', async () => {
      const s = await setup()
      await rejects(authorizeProofUpload(db, await newUser('Người lạ'), s.periodId), 'FORBIDDEN', 'NOT_MEMBER')
      const draftId = newId()
      await db.insert(periods).values({ id: draftId, houseId: s.houseId, year: 2026, month: 11, status: 'draft', dueDate: '2026-12-10' })
      await rejects(authorizeProofUpload(db, s.an, draftId), 'INVALID', 'PERIOD_NOT_CLOSED')
      await rejects(authorizeProofUpload(db, s.an, newId()), 'NOT_FOUND', 'PERIOD_NOT_FOUND')
      await archiveHouse(db, s.owner, s.houseId, { force: true })
      await rejects(authorizeProofUpload(db, s.an, s.periodId), 'FORBIDDEN', 'HOUSE_ARCHIVED')
    })
  })

  describe('confirmPayment / rejectPayment', () => {
    it('xác nhận hai lần → Đã trả, confirmedIn = due, không gấp đôi', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await confirmPayment(db, s.owner, paymentId)
      await confirmPayment(db, s.owner, paymentId)
      const st = (await getStatuses(db, s.periodId))[s.anRow]
      expect(st).toMatchObject({ kind: 'paid', balance: 0, confirmedIn: 2_600_000 })
      const [row] = await db.select().from(payments).where(eq(payments.id, paymentId))
      expect(row).toMatchObject({ status: 'confirmed', decidedBy: s.owner.userId })
      expect(row.decidedAt).toBeInstanceOf(Date)
    })

    it('thành viên (kể cả chính người báo) xác nhận hoặc từ chối → FORBIDDEN', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await rejects(confirmPayment(db, s.an, paymentId), 'FORBIDDEN', 'NOT_OWNER')
      await rejects(rejectPayment(db, s.binh, paymentId, 'Không đúng'), 'FORBIDDEN', 'NOT_OWNER')
      expect((await rowsOf(s.periodId, s.anRow))[0].status).toBe('pending')
    })

    it('chủ nhà của nhà khác không đụng được vào bản ghi; id lạ → NOT_FOUND', async () => {
      const s = await setup()
      const other = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await rejects(confirmPayment(db, other.owner, paymentId), 'FORBIDDEN', 'NOT_MEMBER')
      await rejects(confirmPayment(db, s.owner, newId()), 'NOT_FOUND', 'PAYMENT_NOT_FOUND')
    })

    it('từ chối → quay về Chưa trả, lưu lý do; báo lại được', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await rejectPayment(db, s.owner, paymentId, '  Chưa thấy tiền về  ')
      const [row] = await db.select().from(payments).where(eq(payments.id, paymentId))
      expect(row).toMatchObject({ status: 'rejected', rejectReason: 'Chưa thấy tiền về', decidedBy: s.owner.userId })
      expect((await getStatuses(db, s.periodId))[s.anRow]).toMatchObject({ kind: 'unpaid', balance: 2_600_000 })
      const again = await submitTransfer(db, s.an, s.periodId, {})
      expect(again.paymentId).not.toBe(paymentId)
    })

    it('lý do bắt buộc 1..200 ký tự', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await rejects(rejectPayment(db, s.owner, paymentId, '   '), 'INVALID', 'REASON_INVALID')
      await rejects(rejectPayment(db, s.owner, paymentId, 'x'.repeat(201)), 'INVALID', 'REASON_INVALID')
      await rejectPayment(db, s.owner, paymentId, 'x'.repeat(200))
    })

    it('từ chối bản ghi đã xác nhận và xác nhận bản ghi đã từ chối → CONFLICT', async () => {
      const s = await setup()
      const a = await submitTransfer(db, s.an, s.periodId, {})
      await confirmPayment(db, s.owner, a.paymentId)
      await rejects(rejectPayment(db, s.owner, a.paymentId, 'Nhầm'), 'CONFLICT', 'PAYMENT_DECIDED')
      const b = await submitTransfer(db, s.binh, s.periodId, {})
      await rejectPayment(db, s.owner, b.paymentId, 'Sai số tiền')
      await rejects(confirmPayment(db, s.owner, b.paymentId), 'CONFLICT', 'PAYMENT_DECIDED')
      expect((await rowsOf(s.periodId, s.anRow))[0].status).toBe('confirmed')
    })

    it('nhà đã lưu trữ → FORBIDDEN HOUSE_ARCHIVED', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await archiveHouse(db, s.owner, s.houseId, { force: true })
      await rejects(confirmPayment(db, s.owner, paymentId), 'FORBIDDEN', 'HOUSE_ARCHIVED')
    })
  })

  describe('recordCashPayment', () => {
    it('ghi một phần → Còn thiếu, ghi nốt → Đã trả; bản ghi xác nhận luôn', async () => {
      const s = await setup()
      await recordCashPayment(db, s.owner, s.periodId, s.anRow, 1_000_000)
      expect((await getStatuses(db, s.periodId))[s.anRow]).toMatchObject({ kind: 'partial', balance: 1_600_000, confirmedIn: 1_000_000 })
      await recordCashPayment(db, s.owner, s.periodId, s.anRow, 1_600_000)
      expect((await getStatuses(db, s.periodId))[s.anRow]).toMatchObject({ kind: 'paid', balance: 0 })
      const rows = await rowsOf(s.periodId, s.anRow)
      expect(rows.every((r) => r.direction === 'in' && r.status === 'confirmed' && r.decidedBy === s.owner.userId)).toBe(true)
    })

    it('quá số còn thiếu, không còn thiếu, số tiền sai → INVALID', async () => {
      const s = await setup({ binh: -50_000 })
      await rejects(recordCashPayment(db, s.owner, s.periodId, s.anRow, 2_600_001), 'INVALID', 'AMOUNT_EXCEEDS')
      await rejects(recordCashPayment(db, s.owner, s.periodId, s.binhRow, 1), 'INVALID', 'AMOUNT_EXCEEDS')
      for (const bad of [0, -1, 1.5, MAX_MONEY + 1, Number.NaN]) {
        await rejects(recordCashPayment(db, s.owner, s.periodId, s.anRow, bad), 'INVALID', 'AMOUNT_INVALID')
      }
      expect(await rowsOf(s.periodId, s.anRow)).toHaveLength(0)
    })

    it('chỉ chủ nhà; thành viên không ghi được cho mình', async () => {
      const s = await setup()
      await rejects(recordCashPayment(db, s.an, s.periodId, s.anRow, 1000), 'FORBIDDEN', 'NOT_OWNER')
    })

    it('thành viên không thuộc tháng này (chủ nhà, người nhà khác) → NOT_FOUND', async () => {
      const s = await setup()
      const other = await setup()
      await rejects(recordCashPayment(db, s.owner, s.periodId, s.ownerRow, 1000), 'NOT_FOUND', 'PAYSLIP_NOT_FOUND')
      await rejects(recordCashPayment(db, s.owner, s.periodId, other.anRow, 1000), 'NOT_FOUND', 'PAYSLIP_NOT_FOUND')
    })

    it('còn khoản đang chờ duyệt → CONFLICT HAS_PENDING; tháng nháp → PERIOD_NOT_CLOSED', async () => {
      const s = await setup()
      await submitTransfer(db, s.an, s.periodId, {})
      await rejects(recordCashPayment(db, s.owner, s.periodId, s.anRow, 1000), 'CONFLICT', 'HAS_PENDING')
      const draftId = newId()
      await db.insert(periods).values({ id: draftId, houseId: s.houseId, year: 2026, month: 11, status: 'draft', dueDate: '2026-12-10' })
      await rejects(recordCashPayment(db, s.owner, draftId, s.anRow, 1000), 'INVALID', 'PERIOD_NOT_CLOSED')
    })
  })

  describe('recordRefund', () => {
    it('chủ nhà nợ → trả lại đủ → Đã trả; bản ghi chiều out, xác nhận luôn', async () => {
      const s = await setup({ binh: -50_000 })
      expect((await getStatuses(db, s.periodId))[s.binhRow]).toMatchObject({ kind: 'owner_owes', balance: -50_000 })
      await recordRefund(db, s.owner, s.periodId, s.binhRow, 20_000)
      expect((await getStatuses(db, s.periodId))[s.binhRow]).toMatchObject({ kind: 'owner_owes', balance: -30_000 })
      await recordRefund(db, s.owner, s.periodId, s.binhRow, 30_000)
      expect((await getStatuses(db, s.periodId))[s.binhRow]).toMatchObject({ kind: 'paid', balance: 0 })
      const rows = await rowsOf(s.periodId, s.binhRow)
      expect(rows.every((r) => r.direction === 'out' && r.status === 'confirmed')).toBe(true)
    })

    it('quá số phải trả lại, người không được hoàn, số tiền sai → INVALID; thành viên → FORBIDDEN', async () => {
      const s = await setup({ binh: -50_000 })
      await rejects(recordRefund(db, s.owner, s.periodId, s.binhRow, 50_001), 'INVALID', 'AMOUNT_EXCEEDS')
      await rejects(recordRefund(db, s.owner, s.periodId, s.anRow, 1), 'INVALID', 'AMOUNT_EXCEEDS')
      await rejects(recordRefund(db, s.owner, s.periodId, s.binhRow, 0), 'INVALID', 'AMOUNT_INVALID')
      await rejects(recordRefund(db, s.binh, s.periodId, s.binhRow, 1000), 'FORBIDDEN', 'NOT_OWNER')
    })

    it('sửa sau chốt làm due giảm dưới số đã trả → Chủ nhà nợ; trả lại phần dư → Đã trả', async () => {
      const s = await setup()
      const { paymentId } = await submitTransfer(db, s.an, s.periodId, {})
      await confirmPayment(db, s.owner, paymentId)
      await setDue(s.periodId, s.anRow, 2_500_000)
      expect((await getStatuses(db, s.periodId))[s.anRow]).toMatchObject({ kind: 'owner_owes', balance: -100_000, confirmedIn: 2_600_000 })
      await recordRefund(db, s.owner, s.periodId, s.anRow, 100_000)
      expect((await getStatuses(db, s.periodId))[s.anRow]).toMatchObject({ kind: 'paid', balance: 0 })
    })
  })

  describe('getStatuses', () => {
    it('tháng nháp hoặc không có → {}; tháng chốt: chỉ người có phần phải chuyển', async () => {
      const s = await setup()
      const draftId = newId()
      await db.insert(periods).values({ id: draftId, houseId: s.houseId, year: 2026, month: 11, status: 'draft', dueDate: '2026-12-10' })
      expect(await getStatuses(db, draftId)).toEqual({})
      expect(await getStatuses(db, newId())).toEqual({})
      expect(Object.keys(await getStatuses(db, s.periodId)).sort()).toEqual([s.anRow, s.binhRow].sort())
    })

    it('bản ghi của tháng khác không lẫn vào', async () => {
      const s = await setup()
      const oct = s.periodId
      const nov = await closed(s.houseId, 11, [{ memberId: s.anRow, due: 700_000, share: 700_000 }])
      await recordCashPayment(db, s.owner, nov, s.anRow, 700_000)
      expect((await getStatuses(db, oct))[s.anRow].kind).toBe('unpaid')
      expect((await getStatuses(db, nov))[s.anRow].kind).toBe('paid')
    })
  })

  describe('hasOutstandingBalance', () => {
    it('còn nợ ở tháng đã chốt → true (cả nhà và theo người); trả đủ → false; tháng nháp không tính', async () => {
      const s = await setup({ binh: 0 })
      expect(await hasOutstandingBalance(db, s.houseId)).toBe(true)
      expect(await hasOutstandingBalance(db, s.houseId, s.anRow)).toBe(true)
      expect(await hasOutstandingBalance(db, s.houseId, s.binhRow)).toBe(false)
      await recordCashPayment(db, s.owner, s.periodId, s.anRow, 2_600_000)
      expect(await hasOutstandingBalance(db, s.houseId)).toBe(false)
      await db.insert(periods).values({ id: newId(), houseId: s.houseId, year: 2026, month: 11, status: 'draft', dueDate: '2026-12-10' })
      expect(await hasOutstandingBalance(db, s.houseId)).toBe(false)
    })

    it('chủ nhà còn phải trả lại (balance < 0) cũng là còn nợ', async () => {
      const s = await setup({ an: 0, binh: -10_000 })
      expect(await hasOutstandingBalance(db, s.houseId, s.binhRow)).toBe(true)
      await recordRefund(db, s.owner, s.periodId, s.binhRow, 10_000)
      expect(await hasOutstandingBalance(db, s.houseId)).toBe(false)
    })

    it('đang chờ duyệt vẫn là còn nợ (chưa xác nhận)', async () => {
      const s = await setup({ binh: 0 })
      await submitTransfer(db, s.an, s.periodId, {})
      expect(await hasOutstandingBalance(db, s.houseId, s.anRow)).toBe(true)
    })
  })

  describe('lưu trữ nhà và rời nhà khi còn nợ', () => {
    it('archiveHouse: còn nợ → CONFLICT UNPAID_PERIODS, force:true → OK; đã thu đủ thì không cần force', async () => {
      const s = await setup()
      await rejects(archiveHouse(db, s.owner, s.houseId), 'CONFLICT', 'UNPAID_PERIODS')
      const t = await setup({ an: 0, binh: 0 })
      await archiveHouse(db, t.owner, t.houseId)
      await archiveHouse(db, s.owner, s.houseId, { force: true })
    })

    it('leaveHouse: còn nợ hoặc chủ nhà còn nợ lại → CONFLICT HAS_BALANCE; xong nợ thì rời được', async () => {
      const s = await setup({ binh: -10_000 })
      await rejects(leaveHouse(db, s.an, s.houseId), 'CONFLICT', 'HAS_BALANCE')
      await rejects(leaveHouse(db, s.binh, s.houseId), 'CONFLICT', 'HAS_BALANCE')
      await recordCashPayment(db, s.owner, s.periodId, s.anRow, 2_600_000)
      await recordRefund(db, s.owner, s.periodId, s.binhRow, 10_000)
      await leaveHouse(db, s.an, s.houseId)
      await leaveHouse(db, s.binh, s.houseId)
    })
  })
})
