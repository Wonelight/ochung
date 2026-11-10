import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { notifications, periods, pushSubscriptions, user } from '@/db/schema'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import { addExpense } from './expenses'
import { setMemberQty, upsertChargeItem } from './house-settings'
import { addMemberTx, createHouse, listMembers } from './houses'
import { decideJoinRequest, requestJoinByCode } from './invites'
import {
  listNotifications,
  markAllRead,
  notify,
  remindMember,
  removePushSubscription,
  savePushSubscription,
  sendHouseMessage,
  unreadCount,
} from './notifications'
import { rejectPayment, submitTransfer } from './payments'
import * as events from './period-events'
import type { PushSender } from './period-events'
import { closePeriod, getOrCreateDraftPeriod, setPeriodMember, setUtilityReading } from './periods'
import * as push from './push'

async function expectApp(p: Promise<unknown>, code: string, reason?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (reason) expect((err as AppError).reason).toBe(reason)
}

type Call = { endpoint: string; title: string; body: string; url: string }

/** PushSender giả ghi lại các lần gọi; `gone` là các endpoint trả 'gone'. */
function fakeSender(gone: string[] = []) {
  const calls: Call[] = []
  const send: PushSender = async (sub, payload) => {
    calls.push({ endpoint: sub.endpoint, ...payload })
    return gone.includes(sub.endpoint) ? 'gone' : 'ok'
  }
  return { send, calls }
}

describe('thông báo và web push', () => {
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
    await db.insert(user).values({ id, name, email: `n${n}@nha.local`, accountCode: `N-${String(n).padStart(5, '0')}` })
    return { userId: id, role: 'user' }
  }

  async function subscribe(who: Actor, endpoint = `https://web.push.apple.com/${newId()}`) {
    await db.insert(pushSubscriptions).values({ id: newId(), userId: who.userId, endpoint, p256dh: 'p', auth: 'a' })
    return endpoint
  }

  async function join(houseId: string, who: Actor): Promise<string> {
    return (await db.transaction((tx) => addMemberTx(tx, houseId, who.userId))).id
  }

  async function mine(who: Actor, kind?: string) {
    const rows = await db.select().from(notifications).where(eq(notifications.userId, who.userId))
    return kind ? rows.filter((r) => r.kind === kind) : rows
  }

  /** Nhà của ví dụ §5.4, tháng 11 đã nhập đủ nhưng chưa chốt. Mỗi người có một subscription. */
  async function draft54() {
    const linh = await newUser('Linh')
    const an = await newUser('An')
    const binh = await newUser('Bình')
    const chi = await newUser('Chi')
    const { houseId, code } = await createHouse(db, linh, { name: 'Nhà 5.4' })
    const anId = await join(houseId, an)
    const binhId = await join(houseId, binh)
    const chiId = await join(houseId, chi)
    const linhId = (await listMembers(db, linh, houseId)).find((m) => m.role === 'owner')!.id
    await upsertChargeItem(db, linh, houseId, { name: 'Tiền nhà', kind: 'equal', amount: 8_000_000, active: true })
    await upsertChargeItem(db, linh, houseId, { name: 'Phí dịch vụ', kind: 'equal', amount: 600_000, active: true })
    const xe = await upsertChargeItem(db, linh, houseId, { name: 'Xe', kind: 'per_unit', amount: 120_000, active: true })
    for (const id of [linhId, anId, chiId]) await setMemberQty(db, linh, id, xe, 1)
    const { periodId } = await getOrCreateDraftPeriod(db, linh, houseId, { year: 2026, month: 11 })
    await setPeriodMember(db, linh, periodId, chiId, { days: 15 })
    await setUtilityReading(db, linh, periodId, 'electricity', { total: 1_260_000 })
    await setUtilityReading(db, linh, periodId, 'water', { total: 315_000 })
    await addExpense(db, linh, houseId, { description: 'Nước giặt', amount: 200_000, spentOn: '2026-11-05', paidByMemberId: anId })
    await addExpense(db, linh, houseId, { description: 'Giấy vệ sinh', amount: 120_000, spentOn: '2026-11-12', paidByMemberId: linhId })
    const endpoints = {
      linh: await subscribe(linh),
      an: await subscribe(an),
      binh: await subscribe(binh),
      chi: await subscribe(chi),
    }
    return { linh, an, binh, chi, houseId, code, linhId, anId, binhId, chiId, periodId, endpoints }
  }

  async function closedHouse() {
    const h = await draft54()
    const fake = fakeSender()
    vi.spyOn(push, 'getPushSender').mockReturnValue(fake.send)
    await closePeriod(db, h.linh, h.periodId)
    vi.restoreAllMocks()
    return { ...h, fake }
  }

  describe('chốt sổ', () => {
    it('mỗi thành viên (trừ chủ nhà) nhận đúng 1 thông báo đẩy với số tiền của mình; chủ nhà nhận "Đã chốt sổ tháng 11"', async () => {
      const h = await draft54()
      const fake = fakeSender()
      vi.spyOn(push, 'getPushSender').mockReturnValue(fake.send)
      await closePeriod(db, h.linh, h.periodId)

      const titleOf = async (who: Actor) => (await mine(who, 'period_closed')).map((n) => n.title)
      expect(await titleOf(h.an)).toEqual(['Tháng 11: bạn cần chuyển 2.600.000đ'])
      expect(await titleOf(h.binh)).toEqual(['Tháng 11: bạn cần chuyển 2.680.000đ'])
      expect(await titleOf(h.chi)).toEqual(['Tháng 11: bạn cần chuyển 2.575.000đ'])
      expect(await titleOf(h.linh)).toEqual(['Đã chốt sổ tháng 11'])

      const byEndpoint = new Map(fake.calls.map((c) => [c.endpoint, c]))
      expect(fake.calls).toHaveLength(4)
      expect(byEndpoint.get(h.endpoints.an)).toMatchObject({ title: 'Tháng 11: bạn cần chuyển 2.600.000đ', url: `/phieu/${h.periodId}` })
      expect(byEndpoint.get(h.endpoints.binh)?.title).toBe('Tháng 11: bạn cần chuyển 2.680.000đ')
      expect(byEndpoint.get(h.endpoints.chi)?.title).toBe('Tháng 11: bạn cần chuyển 2.575.000đ')
      expect(byEndpoint.get(h.endpoints.linh)?.title).toBe('Đã chốt sổ tháng 11')
      const [an] = await mine(h.an, 'period_closed')
      expect(an).toMatchObject({ houseId: h.houseId, url: `/phieu/${h.periodId}`, readAt: null })
    })

    it('người không được tính tháng này không nhận; người đã rời nhà trước khi chốt nhưng có phiếu vẫn nhận', async () => {
      const h = await draft54()
      await setPeriodMember(db, h.linh, h.periodId, h.binhId, { included: false })
      await db.execute(sql`update house_members set left_at = now() where id = ${h.chiId}`)
      const fake = fakeSender()
      vi.spyOn(push, 'getPushSender').mockReturnValue(fake.send)
      await closePeriod(db, h.linh, h.periodId)
      expect(await mine(h.binh, 'period_closed')).toHaveLength(0)
      expect((await mine(h.chi, 'period_closed')).map((n) => n.title)).toHaveLength(1)
      expect(await mine(h.an, 'period_closed')).toHaveLength(1)
      expect(fake.calls.map((c) => c.endpoint).sort()).toEqual([h.endpoints.an, h.endpoints.chi, h.endpoints.linh].sort())
    })

    it('tháng đã chốt: người rời nhà sau khi chốt vẫn nhận phiếu cập nhật; tài khoản bị khóa thì không', async () => {
      const h = await closedHouse()
      await db.execute(sql`update house_members set left_at = now() where id = ${h.chiId}`)
      await db.execute(sql`update "user" set banned = true where id = ${h.binh.userId}`)
      const fake = fakeSender()
      await events.onPeriodUpdated(db, h.periodId, { send: fake.send })
      expect((await mine(h.chi, 'period_updated')).map((n) => n.title)).toEqual(['Phiếu tháng 11 đã cập nhật'])
      expect(await mine(h.binh, 'period_updated')).toHaveLength(0)
      expect((await mine(h.an, 'period_updated')).map((n) => n.title)).toEqual(['Phiếu tháng 11 đã cập nhật'])
      expect(fake.calls.map((c) => c.endpoint).sort()).toEqual([h.endpoints.an, h.endpoints.chi].sort())
    })

    it('sửa sau chốt qua hàm server → period_updated 1 lần cho mỗi thành viên, chủ nhà không nhận', async () => {
      const h = await closedHouse()
      const fake = fakeSender()
      vi.spyOn(push, 'getPushSender').mockReturnValue(fake.send)
      await setPeriodMember(db, h.linh, h.periodId, h.chiId, { days: 20 })
      for (const who of [h.an, h.binh, h.chi]) expect(await mine(who, 'period_updated')).toHaveLength(1)
      expect(await mine(h.linh, 'period_updated')).toHaveLength(0)
      expect(fake.calls).toHaveLength(3)
      expect(fake.calls.every((c) => c.title === 'Phiếu tháng 11 đã cập nhật' && c.url === `/phieu/${h.periodId}`)).toBe(true)
    })

    it('chủ nhà phải trả lại: "chủ nhà cần trả lại bạn X"', async () => {
      const h = await closedHouse()
      const [row] = await db.select({ result: periods.result }).from(periods).where(eq(periods.id, h.periodId))
      const result = row.result!
      result.payslips = result.payslips.map((p) => (p.memberId === h.binhId ? { ...p, due: -171_428 } : p))
      await db.update(periods).set({ result }).where(eq(periods.id, h.periodId))
      await events.onPeriodUpdated(db, h.periodId, { send: fakeSender().send })
      expect((await mine(h.binh, 'period_updated')).map((n) => n.title)).toEqual(['Phiếu tháng 11 đã cập nhật'])
      const owes = await mine(h.binh, 'period_updated')
      expect(owes[0].body).toBe('Chủ nhà cần trả lại bạn 171.428đ')

      await db.delete(notifications).where(eq(notifications.userId, h.binh.userId))
      await db.update(periods).set({ result: { ...result, payslips: result.payslips } }).where(eq(periods.id, h.periodId))
      await events.onPeriodClosed(db, h.periodId, { send: fakeSender().send })
      expect((await mine(h.binh, 'period_closed')).map((n) => n.title)).toEqual(['Tháng 11: chủ nhà cần trả lại bạn 171.428đ'])
    })

    it('lỗi bên trong hook (kể cả gửi push hỏng) không nổi lên người gọi', async () => {
      const h = await closedHouse()
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      const boom: PushSender = async () => {
        throw new Error('push hỏng')
      }
      await expect(events.onPeriodUpdated(db, h.periodId, { send: boom })).resolves.toBeUndefined()
      expect(await mine(h.an, 'period_updated')).toHaveLength(1) // thông báo trong app vẫn được ghi
      await expect(events.onPeriodClosed({} as Db, h.periodId)).resolves.toBeUndefined()
      await expect(events.onPeriodUpdated(db, 'khong-co')).resolves.toBeUndefined()
      expect(err).toHaveBeenCalled()
    })
  })

  describe('notify', () => {
    it('PushSender trả "gone" → subscription đó bị xóa, các subscription khác giữ nguyên', async () => {
      const a = await newUser('A')
      const b = await newUser('B')
      const dead = await subscribe(a)
      const alive = await subscribe(a)
      const other = await subscribe(b)
      const fake = fakeSender([dead])
      await notify(db, fake.send, { userIds: [a.userId, b.userId], houseId: null, kind: 'owner_message', title: 't', body: 'b', url: '/thong-bao', push: true })
      expect(fake.calls).toHaveLength(3)
      const left = (await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, a.userId))).map((r) => r.endpoint)
      expect(left).toEqual([alive])
      expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, other))).toHaveLength(1)
    })

    it('push:false thì ghi thông báo nhưng không gọi PushSender; sender ném lỗi thì không làm hỏng notify', async () => {
      const a = await newUser('A')
      await subscribe(a)
      const fake = fakeSender()
      await notify(db, fake.send, { userIds: [a.userId], houseId: null, kind: 'join_request', title: 't', body: 'b', url: '/nha', push: false })
      expect(fake.calls).toHaveLength(0)
      expect(await mine(a, 'join_request')).toHaveLength(1)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const boom: PushSender = async () => {
        throw new Error('x')
      }
      await expect(
        notify(db, boom, { userIds: [a.userId], houseId: null, kind: 'owner_message', title: 't2', body: 'b', url: '/', push: true }),
      ).resolves.toBeUndefined()
      expect(await mine(a, 'owner_message')).toHaveLength(1)
    })

    it('chỉ 4 loại period_closed/period_updated/owner_message/reminder được gửi đẩy', async () => {
      const a = await newUser('A')
      await subscribe(a)
      const fake = fakeSender()
      const kinds = ['join_request', 'join_approved', 'join_rejected', 'transfer_submitted', 'payment_rejected'] as const
      for (const kind of kinds) {
        await notify(db, fake.send, { userIds: [a.userId], houseId: null, kind, title: 't', body: 'b', url: '/', push: true })
      }
      expect(fake.calls).toHaveLength(0)
      expect(await mine(a)).toHaveLength(kinds.length)
    })
  })

  describe('chủ nhà tự gửi', () => {
    it('sendHouseMessage audience "all": mọi thành viên trừ chủ nhà nhận, có gửi đẩy', async () => {
      const h = await closedHouse()
      const fake = fakeSender()
      const res = await sendHouseMessage(db, fake.send, h.linh, h.houseId, { body: '  Mai cắt nước 8h-10h  ', audience: 'all' })
      expect(res).toEqual({ recipients: 3 })
      expect(fake.calls).toHaveLength(3)
      expect(fake.calls[0]).toMatchObject({ body: 'Mai cắt nước 8h-10h' })
      expect(await mine(h.an, 'owner_message')).toHaveLength(1)
      expect(await mine(h.linh, 'owner_message')).toHaveLength(0)
    })

    it('audience "unpaid": chỉ người unpaid/partial/pending (tháng đã chốt gần nhất) nhận', async () => {
      const h = await closedHouse()
      // An: đã trả đủ (tiền mặt xác nhận); Bình: chờ xác nhận; Chi: chưa trả
      await db.execute(
        sql`insert into payments (id, period_id, member_id, direction, amount, status, created_by) values (${newId()}, ${h.periodId}, ${h.anId}, 'in', 2600000, 'confirmed', ${h.linh.userId})`,
      )
      await submitTransfer(db, h.binh, h.periodId, {})
      const fake = fakeSender()
      const res = await sendHouseMessage(db, fake.send, h.linh, h.houseId, { body: 'Nhớ đóng tiền', audience: 'unpaid' })
      expect(res).toEqual({ recipients: 2 })
      expect(fake.calls.map((c) => c.endpoint).sort()).toEqual([h.endpoints.binh, h.endpoints.chi].sort())
      expect(await mine(h.an, 'owner_message')).toHaveLength(0)
    })

    it('thành viên gọi sendHouseMessage / remindMember → FORBIDDEN; nội dung rỗng hoặc quá 200 ký tự → INVALID', async () => {
      const h = await closedHouse()
      const fake = fakeSender()
      await expectApp(sendHouseMessage(db, fake.send, h.an, h.houseId, { body: 'hi', audience: 'all' }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(remindMember(db, fake.send, h.an, h.periodId, h.chiId), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(sendHouseMessage(db, fake.send, h.linh, h.houseId, { body: '   ', audience: 'all' }), 'INVALID')
      await expectApp(sendHouseMessage(db, fake.send, h.linh, h.houseId, { body: 'x'.repeat(201), audience: 'all' }), 'INVALID')
      expect((await sendHouseMessage(db, fake.send, h.linh, h.houseId, { body: 'x'.repeat(200), audience: 'all' })).recipients).toBe(3)
    })

    it('remindMember: gửi "Nhắc đóng tiền tháng 11: X", chỉ khi còn nợ; nhắc lại trong 10 phút → CONFLICT REMIND_TOO_SOON', async () => {
      const h = await closedHouse()
      const fake = fakeSender()
      await remindMember(db, fake.send, h.linh, h.periodId, h.anId)
      expect(fake.calls).toHaveLength(1)
      expect(fake.calls[0]).toMatchObject({ endpoint: h.endpoints.an, title: 'Nhắc đóng tiền tháng 11: 2.600.000đ', url: `/phieu/${h.periodId}` })
      expect(await mine(h.an, 'reminder')).toHaveLength(1)

      await expectApp(remindMember(db, fake.send, h.linh, h.periodId, h.anId), 'CONFLICT', 'REMIND_TOO_SOON')
      expect(fake.calls).toHaveLength(1)
      // người khác trong cùng tháng không bị ảnh hưởng
      await remindMember(db, fake.send, h.linh, h.periodId, h.binhId)
      expect(fake.calls).toHaveLength(2)

      await db.execute(sql`update notifications set created_at = now() - interval '11 minutes' where user_id = ${h.an.userId} and kind = 'reminder'`)
      await remindMember(db, fake.send, h.linh, h.periodId, h.anId)
      expect(await mine(h.an, 'reminder')).toHaveLength(2)
    })

    it('remindMember: chủ nhà, người đã trả đủ, người không có phiếu → lỗi; tháng nháp → INVALID', async () => {
      const h = await closedHouse()
      const fake = fakeSender()
      await expectApp(remindMember(db, fake.send, h.linh, h.periodId, h.linhId), 'NOT_FOUND', 'PAYSLIP_NOT_FOUND')
      await db.execute(
        sql`insert into payments (id, period_id, member_id, direction, amount, status, created_by) values (${newId()}, ${h.periodId}, ${h.anId}, 'in', 2600000, 'confirmed', ${h.linh.userId})`,
      )
      await expectApp(remindMember(db, fake.send, h.linh, h.periodId, h.anId), 'CONFLICT', 'NOTHING_DUE')
      const draft = await draft54()
      await expectApp(remindMember(db, fake.send, draft.linh, draft.periodId, draft.anId), 'INVALID', 'PERIOD_NOT_CLOSED')
      expect(fake.calls).toHaveLength(0)
    })
  })

  describe('lỗi ở pha push sau commit', () => {
    /** db mà truy vấn bảng push_subscriptions luôn lỗi (mô phỏng DB chập chờn sau khi đã ghi thông báo). */
    function flakySubscriptions(real: Db): Db {
      return new Proxy(real, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target)
          if (prop !== 'select' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value
          return (...args: unknown[]) => {
            const builder = (value as (...a: unknown[]) => { from: (t: unknown) => unknown }).apply(target, args)
            return new Proxy(builder, {
              get(b, p) {
                const v = Reflect.get(b, p, b)
                if (p !== 'from') return typeof v === 'function' ? v.bind(b) : v
                return (table: unknown) => {
                  if (table === pushSubscriptions) throw new Error('DB chập chờn')
                  return (v as (t: unknown) => unknown).call(b, table)
                }
              },
            })
          }
        },
      }) as Db
    }

    it('remindMember: lỗi truy vấn subscription sau commit không làm hàm thất bại; thông báo ghi đúng 1 lần', async () => {
      const h = await closedHouse()
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(remindMember(flakySubscriptions(db), fakeSender().send, h.linh, h.periodId, h.anId)).resolves.toBeUndefined()
      expect(await mine(h.an, 'reminder')).toHaveLength(1)
      expect(err).toHaveBeenCalled()
    })

    it('sendHouseMessage: lỗi pha push không làm hàm thất bại; mỗi người nhận đúng 1 thông báo', async () => {
      const h = await closedHouse()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(
        sendHouseMessage(flakySubscriptions(db), fakeSender().send, h.linh, h.houseId, { body: 'Xin chào', audience: 'all' }),
      ).resolves.toEqual({ recipients: 3 })
      for (const who of [h.an, h.binh, h.chi]) expect(await mine(who, 'owner_message')).toHaveLength(1)
    })

    it('xóa subscription "gone" bị lỗi cũng không ném', async () => {
      const a = await newUser('A')
      const dead = await subscribe(a)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const brokenDelete = new Proxy(db, {
        get(target, prop) {
          const v = Reflect.get(target, prop, target)
          if (prop === 'delete') return () => { throw new Error('DB chập chờn') }
          return typeof v === 'function' ? v.bind(target) : v
        },
      }) as Db
      await expect(
        notify(brokenDelete, fakeSender([dead]).send, { userIds: [a.userId], houseId: null, kind: 'owner_message', title: 't', body: 'b', url: '/', push: true }),
      ).resolves.toBeUndefined()
      expect(await mine(a, 'owner_message')).toHaveLength(1)
    })
  })

  describe('thông báo trong app (không gửi đẩy)', () => {
    it('requestJoinByCode → chủ nhà có join_request, PushSender không được gọi; duyệt/từ chối → người xin nhận kết quả', async () => {
      const h = await draft54()
      const fake = fakeSender()
      vi.spyOn(push, 'getPushSender').mockReturnValue(fake.send)
      const guest = await newUser('Khách')
      await subscribe(guest)
      const { requestId } = await requestJoinByCode(db, guest, h.code)
      const [req] = await mine(h.linh, 'join_request')
      expect(req).toMatchObject({ houseId: h.houseId, url: '/nha' })
      expect(req.title).toContain('Khách')
      await decideJoinRequest(db, h.linh, requestId, 'approve')
      expect((await mine(guest, 'join_approved'))[0]).toMatchObject({ houseId: h.houseId, url: '/' })

      const guest2 = await newUser('Khách hai')
      const { requestId: r2 } = await requestJoinByCode(db, guest2, h.code)
      await decideJoinRequest(db, h.linh, r2, 'reject')
      expect(await mine(guest2, 'join_rejected')).toHaveLength(1)
      expect(fake.calls).toHaveLength(0)
    })

    it('submitTransfer → chủ nhà có transfer_submitted; rejectPayment → thành viên có payment_rejected kèm lý do; không gửi đẩy', async () => {
      const h = await closedHouse()
      const fake = fakeSender()
      vi.spyOn(push, 'getPushSender').mockReturnValue(fake.send)
      const { paymentId } = await submitTransfer(db, h.an, h.periodId, {})
      const [t] = await mine(h.linh, 'transfer_submitted')
      expect(t).toMatchObject({ houseId: h.houseId, url: `/hoa-don?ky=${h.periodId}` })
      expect(t.title).toContain('An')
      expect(t.title).toContain('2.600.000đ')
      // gọi lại khi đã có khoản chờ: không tạo thêm thông báo
      await submitTransfer(db, h.an, h.periodId, {})
      expect(await mine(h.linh, 'transfer_submitted')).toHaveLength(1)

      await rejectPayment(db, h.linh, paymentId, 'Chưa thấy tiền về')
      const [rej] = await mine(h.an, 'payment_rejected')
      expect(rej).toMatchObject({ url: `/phieu/${h.periodId}` })
      expect(rej.body).toContain('Chưa thấy tiền về')
      expect(fake.calls).toHaveLength(0)
    })
  })

  describe('chuông', () => {
    it('listNotifications / unreadCount / markAllRead chỉ động tới thông báo của chính người gọi', async () => {
      const a = await newUser('A')
      const b = await newUser('B')
      const send = fakeSender().send
      for (const [who, title] of [[a, 'một'], [a, 'hai'], [b, 'ba']] as const) {
        await notify(db, send, { userIds: [who.userId], houseId: null, kind: 'owner_message', title, body: 'x', url: '/', push: false })
        await db.execute(sql`select pg_sleep(0.01)`)
      }
      expect(await unreadCount(db, a)).toBe(2)
      expect((await listNotifications(db, a)).map((n) => n.title)).toEqual(['hai', 'một']) // mới nhất trước
      await markAllRead(db, a)
      expect(await unreadCount(db, a)).toBe(0)
      expect(await unreadCount(db, b)).toBe(1)
      expect((await listNotifications(db, a)).every((n) => n.readAt !== null)).toBe(true)
    })
  })

  describe('đăng ký push', () => {
    const sub = { endpoint: 'https://web.push.apple.com/abc', p256dh: 'pk', auth: 'au' }

    it('lưu theo endpoint (đăng ký lại cùng endpoint chỉ cập nhật, kể cả đổi người dùng); xóa chỉ xóa của chính mình', async () => {
      const a = await newUser('A')
      const b = await newUser('B')
      await savePushSubscription(db, a, sub)
      await savePushSubscription(db, a, sub)
      expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))).toHaveLength(1)
      await savePushSubscription(db, b, { ...sub, p256dh: 'pk2' })
      const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
      expect(row).toMatchObject({ userId: b.userId, p256dh: 'pk2' })
      await removePushSubscription(db, a, sub.endpoint)
      expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))).toHaveLength(1)
      await removePushSubscription(db, b, sub.endpoint)
      expect(await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, sub.endpoint)))).toHaveLength(0)
    })

    it('từ chối endpoint không phải dịch vụ push hợp lệ hoặc thiếu khóa', async () => {
      const a = await newUser('A')
      await expectApp(savePushSubscription(db, a, { ...sub, endpoint: 'http://web.push.apple.com/x' }), 'INVALID', 'PUSH_SUBSCRIPTION')
      await expectApp(savePushSubscription(db, a, { ...sub, endpoint: 'https://evil.example.com/x' }), 'INVALID', 'PUSH_SUBSCRIPTION')
      await expectApp(savePushSubscription(db, a, { ...sub, endpoint: 'https://127.0.0.1/x' }), 'INVALID', 'PUSH_SUBSCRIPTION')
      await expectApp(savePushSubscription(db, a, { ...sub, auth: '' }), 'INVALID', 'PUSH_SUBSCRIPTION')
      for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/x']) {
        await savePushSubscription(db, a, { ...sub, endpoint })
      }
    })
  })
})
