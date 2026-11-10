import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { chargeItems, houseMembers, houses, memberChargeQty, user, utilityTariffs } from '@/db/schema'
import type { Tariff } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { tariffSchema } from '@/lib/validation'
import type { Actor } from './actor'
import {
  deleteChargeItem,
  getHouseSettings,
  reorderChargeItems,
  setBankInfo,
  setDueDay,
  setMemberQty,
  setUtilityTariff,
  upsertChargeItem,
} from './house-settings'
import { addMemberTx, createHouse } from './houses'

const GOOD_TARIFF: Tariff = {
  tiers: [
    { upTo: 50, price: 1984 },
    { upTo: 100, price: 2050 },
    { upTo: null, price: 2380 },
  ],
  perPerson: false,
  registeredPeople: 1,
  vatPct: 8,
  surcharges: [{ name: 'Phí BVMT', pct: 10 }],
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

describe('tariffSchema', () => {
  const parse = (t: unknown) => tariffSchema.safeParse(t)

  it('chấp nhận bảng giá hợp lệ', () => {
    expect(parse(GOOD_TARIFF).success).toBe(true)
  })
  it('từ chối upTo giảm dần hoặc bằng nhau', () => {
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: 100, price: 1 }, { upTo: 50, price: 2 }, { upTo: null, price: 3 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: 50, price: 1 }, { upTo: 50, price: 2 }, { upTo: null, price: 3 }] }).success).toBe(false)
  })
  it('từ chối tiers rỗng', () => {
    expect(parse({ ...GOOD_TARIFF, tiers: [] }).success).toBe(false)
  })
  it('bậc cuối phải là null, null chỉ ở bậc cuối', () => {
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: 50, price: 1 }, { upTo: 100, price: 2 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: null, price: 1 }, { upTo: null, price: 2 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: null, price: 1 }, { upTo: 50, price: 2 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: null, price: 1999 }] }).success).toBe(true)
  })
  it('giá phải là số nguyên không âm', () => {
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: null, price: -1 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, tiers: [{ upTo: null, price: 10.5 }] }).success).toBe(false)
  })
  it('pct 0..100 với tối đa 1 chữ số thập phân', () => {
    expect(parse({ ...GOOD_TARIFF, vatPct: 7.5 }).success).toBe(true)
    expect(parse({ ...GOOD_TARIFF, vatPct: 7.55 }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, vatPct: 100.1 }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, vatPct: -1 }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, surcharges: [{ name: 'X', pct: 101 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, surcharges: [{ name: 'X', pct: 0.3 }] }).success).toBe(true)
  })
  it('tên phụ phí không rỗng; số người đăng ký nguyên ≥ 1', () => {
    expect(parse({ ...GOOD_TARIFF, surcharges: [{ name: '  ', pct: 5 }] }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, registeredPeople: 0 }).success).toBe(false)
    expect(parse({ ...GOOD_TARIFF, registeredPeople: 2.5 }).success).toBe(false)
  })
})

describe('cài đặt nhà', () => {
  let db: Db
  let seq = 0

  beforeAll(async () => {
    db = await createTestDb()
  }, 30_000)

  async function newUser(name = 'Người dùng'): Promise<Actor> {
    const n = seq++
    const id = newId()
    await db.insert(user).values({ id, name, email: `s${n}@nha.local`, accountCode: `S-${String(n).padStart(5, '0')}` })
    return { userId: id, role: 'user' }
  }

  async function setup() {
    const owner = await newUser('Chủ')
    const member = await newUser('An')
    const { houseId } = await createHouse(db, owner, { name: 'Nhà Test' })
    const m = await db.transaction((tx) => addMemberTx(tx, houseId, member.userId))
    return { owner, member, houseId, memberId: m.id }
  }

  describe('upsertChargeItem', () => {
    it('thêm khoản mới, sortOrder tăng dần, rồi sửa', async () => {
      const { owner, houseId } = await setup()
      const a = await upsertChargeItem(db, owner, houseId, { name: ' Tiền nhà ', kind: 'equal', amount: 2_600_000, active: true })
      const b = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await upsertChargeItem(db, owner, houseId, { id: a, name: 'Tiền phòng', kind: 'equal', amount: 2_700_000, active: true })
      const { items } = await getHouseSettings(db, owner, houseId)
      expect(items.map((i) => [i.id, i.name, i.amount, i.kind])).toEqual([
        [a, 'Tiền phòng', 2_700_000, 'equal'],
        [b, 'Xe', 150_000, 'per_unit'],
      ])
    })

    it('amount âm, lẻ, NaN, tên rỗng hoặc kind lạ → INVALID', async () => {
      const { owner, houseId } = await setup()
      const base = { name: 'X', kind: 'equal' as const, amount: 1000, active: true }
      await expectApp(upsertChargeItem(db, owner, houseId, { ...base, amount: -1 }), 'INVALID')
      await expectApp(upsertChargeItem(db, owner, houseId, { ...base, amount: 10.5 }), 'INVALID')
      await expectApp(upsertChargeItem(db, owner, houseId, { ...base, amount: Number.NaN }), 'INVALID')
      await expectApp(upsertChargeItem(db, owner, houseId, { ...base, name: '   ' }), 'INVALID')
      await expectApp(upsertChargeItem(db, owner, houseId, { ...base, kind: 'other' as 'equal' }), 'INVALID')
    })

    it('sửa khoản của nhà khác hoặc khoản đã xóa → NOT_FOUND', async () => {
      const a = await setup()
      const b = await setup()
      const id = await upsertChargeItem(db, a.owner, a.houseId, { name: 'Rác', kind: 'equal', amount: 50_000, active: true })
      await expectApp(upsertChargeItem(db, b.owner, b.houseId, { id, name: 'Rác', kind: 'equal', amount: 1, active: true }), 'NOT_FOUND')
      await deleteChargeItem(db, a.owner, id)
      await expectApp(upsertChargeItem(db, a.owner, a.houseId, { id, name: 'Rác', kind: 'equal', amount: 1, active: true }), 'NOT_FOUND')
    })
  })

  describe('deleteChargeItem', () => {
    it('xóa mềm: ẩn khỏi danh sách, dòng vẫn còn trong DB', async () => {
      const { owner, houseId } = await setup()
      const id = await upsertChargeItem(db, owner, houseId, { name: 'Rác', kind: 'equal', amount: 50_000, active: true })
      await deleteChargeItem(db, owner, id)
      expect((await getHouseSettings(db, owner, houseId)).items).toEqual([])
      const [row] = await db.select().from(chargeItems).where(eq(chargeItems.id, id))
      expect(row.active).toBe(false)
    })
    it('khoản không tồn tại → NOT_FOUND', async () => {
      const { owner } = await setup()
      await expectApp(deleteChargeItem(db, owner, newId()), 'NOT_FOUND')
    })
  })

  describe('reorderChargeItems', () => {
    it('đổi thứ tự theo ids', async () => {
      const { owner, houseId } = await setup()
      const a = await upsertChargeItem(db, owner, houseId, { name: 'A', kind: 'equal', amount: 1, active: true })
      const b = await upsertChargeItem(db, owner, houseId, { name: 'B', kind: 'equal', amount: 1, active: true })
      const c = await upsertChargeItem(db, owner, houseId, { name: 'C', kind: 'equal', amount: 1, active: true })
      await reorderChargeItems(db, owner, houseId, [c, a, b])
      expect((await getHouseSettings(db, owner, houseId)).items.map((i) => i.id)).toEqual([c, a, b])
    })
    it('thiếu, thừa, trùng hoặc của nhà khác → INVALID', async () => {
      const x = await setup()
      const y = await setup()
      const a = await upsertChargeItem(db, x.owner, x.houseId, { name: 'A', kind: 'equal', amount: 1, active: true })
      const b = await upsertChargeItem(db, x.owner, x.houseId, { name: 'B', kind: 'equal', amount: 1, active: true })
      const foreign = await upsertChargeItem(db, y.owner, y.houseId, { name: 'Z', kind: 'equal', amount: 1, active: true })
      await expectApp(reorderChargeItems(db, x.owner, x.houseId, [a]), 'INVALID')
      await expectApp(reorderChargeItems(db, x.owner, x.houseId, [a, a]), 'INVALID')
      await expectApp(reorderChargeItems(db, x.owner, x.houseId, [a, b, foreign]), 'INVALID')
      await expectApp(reorderChargeItems(db, x.owner, x.houseId, [a, foreign]), 'INVALID')
    })
  })

  describe('setMemberQty', () => {
    it('lưu số lượng và ghi đè lần sau', async () => {
      const { owner, houseId, memberId } = await setup()
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await setMemberQty(db, owner, memberId, xe, 2)
      await setMemberQty(db, owner, memberId, xe, 1)
      const { qty } = await getHouseSettings(db, owner, houseId)
      expect(qty).toEqual([{ memberId, itemId: xe, qty: 1 }])
    })
    it('qty âm, lẻ → INVALID; khoản "chia đều" → INVALID', async () => {
      const { owner, houseId, memberId } = await setup()
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      const rac = await upsertChargeItem(db, owner, houseId, { name: 'Rác', kind: 'equal', amount: 50_000, active: true })
      await expectApp(setMemberQty(db, owner, memberId, xe, -1), 'INVALID')
      await expectApp(setMemberQty(db, owner, memberId, xe, 1.5), 'INVALID')
      await expectApp(setMemberQty(db, owner, memberId, rac, 1), 'INVALID')
    })
    it('member của nhà khác → FORBIDDEN', async () => {
      const a = await setup()
      const b = await setup()
      const xe = await upsertChargeItem(db, a.owner, a.houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await expectApp(setMemberQty(db, a.owner, b.memberId, xe, 1), 'FORBIDDEN')
      expect(await db.select().from(memberChargeQty).where(eq(memberChargeQty.memberId, b.memberId))).toEqual([])
    })
    it('chủ nhà khác không sửa được số lượng của nhà này → FORBIDDEN', async () => {
      const a = await setup()
      const b = await setup()
      const xe = await upsertChargeItem(db, a.owner, a.houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await expectApp(setMemberQty(db, b.owner, a.memberId, xe, 1), 'FORBIDDEN')
    })
    it('thành viên đã rời nhà → NOT_FOUND', async () => {
      const { owner, houseId, memberId } = await setup()
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await db.update(houseMembers).set({ leftAt: new Date() }).where(eq(houseMembers.id, memberId))
      await expectApp(setMemberQty(db, owner, memberId, xe, 1), 'NOT_FOUND')
    })
  })

  describe('setUtilityTariff', () => {
    it('theo bậc lưu mode và bảng giá', async () => {
      const { owner, houseId } = await setup()
      await setUtilityTariff(db, owner, houseId, 'electricity', { mode: 'tiered', tariff: GOOD_TARIFF })
      const { tariffs } = await getHouseSettings(db, owner, houseId)
      expect(tariffs.electricity).toEqual({ mode: 'tiered', tariff: GOOD_TARIFF })
      expect(tariffs.water.mode).toBe('total')
    })
    it('mode tiered mà tariff null → INVALID', async () => {
      const { owner, houseId } = await setup()
      await expectApp(setUtilityTariff(db, owner, houseId, 'water', { mode: 'tiered', tariff: null }), 'INVALID')
    })
    it('tariff có upTo giảm dần → INVALID và không đổi gì', async () => {
      const { owner, houseId } = await setup()
      const bad: Tariff = { ...GOOD_TARIFF, tiers: [{ upTo: 100, price: 1 }, { upTo: 50, price: 2 }, { upTo: null, price: 3 }] }
      await expectApp(setUtilityTariff(db, owner, houseId, 'water', { mode: 'tiered', tariff: bad }), 'INVALID')
      expect((await getHouseSettings(db, owner, houseId)).tariffs.water.mode).toBe('total')
    })
    it('chuyển về total với tariff null giữ nguyên bảng giá đã cài', async () => {
      const { owner, houseId } = await setup()
      await setUtilityTariff(db, owner, houseId, 'water', { mode: 'tiered', tariff: GOOD_TARIFF })
      await setUtilityTariff(db, owner, houseId, 'water', { mode: 'total', tariff: null })
      expect((await getHouseSettings(db, owner, houseId)).tariffs.water).toEqual({ mode: 'total', tariff: GOOD_TARIFF })
    })
    it('VAT 8,5 và phụ phí 7,5 lưu rồi đọc lại đúng nguyên giá trị', async () => {
      const { owner, houseId } = await setup()
      const tariff: Tariff = { ...GOOD_TARIFF, vatPct: 8.5, surcharges: [{ name: 'Phí BVMT', pct: 7.5 }] }
      await setUtilityTariff(db, owner, houseId, 'water', { mode: 'tiered', tariff })
      const got = (await getHouseSettings(db, owner, houseId)).tariffs.water.tariff
      expect(got.vatPct).toBe(8.5)
      expect(got.surcharges).toEqual([{ name: 'Phí BVMT', pct: 7.5 }])
    })
    it('chuẩn hóa tên phụ phí (cắt khoảng trắng) khi lưu', async () => {
      const { owner, houseId } = await setup()
      await setUtilityTariff(db, owner, houseId, 'water', {
        mode: 'tiered',
        tariff: { ...GOOD_TARIFF, surcharges: [{ name: '  Phí BVMT  ', pct: 10 }] },
      })
      const [row] = await db
        .select()
        .from(utilityTariffs)
        .where(and(eq(utilityTariffs.houseId, houseId), eq(utilityTariffs.utility, 'water')))
      expect(row.tariff.surcharges).toEqual([{ name: 'Phí BVMT', pct: 10 }])
    })
  })

  describe('setBankInfo / setDueDay', () => {
    it('lưu ngân hàng, chuẩn hóa tên chủ tài khoản và số tài khoản', async () => {
      const { owner, houseId } = await setup()
      await setBankInfo(db, owner, houseId, { bankBin: '970436', accountNo: '0123 456 789', accountName: ' Nguyễn Văn Đạt ' })
      expect((await getHouseSettings(db, owner, houseId)).bank).toEqual({
        bankBin: '970436',
        accountNo: '0123456789',
        accountName: 'NGUYEN VAN DAT',
      })
    })
    it('BIN không có trong danh sách, số tài khoản sai, tên quá dài hoặc rỗng → INVALID', async () => {
      const { owner, houseId } = await setup()
      const ok = { bankBin: '970436', accountNo: '0123456789', accountName: 'NGUYEN VAN A' }
      await expectApp(setBankInfo(db, owner, houseId, { ...ok, bankBin: '123456' }), 'INVALID')
      await expectApp(setBankInfo(db, owner, houseId, { ...ok, accountNo: '12345' }), 'INVALID')
      await expectApp(setBankInfo(db, owner, houseId, { ...ok, accountNo: '1'.repeat(20) }), 'INVALID')
      await expectApp(setBankInfo(db, owner, houseId, { ...ok, accountNo: '12ab56789' }), 'INVALID')
      await expectApp(setBankInfo(db, owner, houseId, { ...ok, accountName: 'A'.repeat(51) }), 'INVALID')
      await expectApp(setBankInfo(db, owner, houseId, { ...ok, accountName: '   ' }), 'INVALID')
    })
    it('xóa toàn bộ bằng null; chỉ điền một phần → INVALID', async () => {
      const { owner, houseId } = await setup()
      await setBankInfo(db, owner, houseId, { bankBin: '970422', accountNo: '999999999', accountName: 'A' })
      await setBankInfo(db, owner, houseId, { bankBin: null, accountNo: null, accountName: null })
      expect((await getHouseSettings(db, owner, houseId)).bank).toEqual({ bankBin: null, accountNo: null, accountName: null })
      await expectApp(setBankInfo(db, owner, houseId, { bankBin: '970422', accountNo: null, accountName: null }), 'INVALID')
    })
    it('hạn đóng 1..28', async () => {
      const { owner, houseId } = await setup()
      await setDueDay(db, owner, houseId, 7)
      expect((await getHouseSettings(db, owner, houseId)).dueDay).toBe(7)
      await expectApp(setDueDay(db, owner, houseId, 29), 'INVALID')
      await expectApp(setDueDay(db, owner, houseId, 0), 'INVALID')
      await expectApp(setDueDay(db, owner, houseId, 5.5), 'INVALID')
    })
  })

  describe('phân quyền', () => {
    it('thành viên gọi bất kỳ hàm ghi nào → FORBIDDEN', async () => {
      const { owner, member, houseId, memberId } = await setup()
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await expectApp(upsertChargeItem(db, member, houseId, { name: 'X', kind: 'equal', amount: 1, active: true }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(upsertChargeItem(db, member, houseId, { id: xe, name: 'X', kind: 'equal', amount: 1, active: true }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(deleteChargeItem(db, member, xe), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(reorderChargeItems(db, member, houseId, [xe]), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setMemberQty(db, member, memberId, xe, 1), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setUtilityTariff(db, member, houseId, 'water', { mode: 'total', tariff: null }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setBankInfo(db, member, houseId, { bankBin: null, accountNo: null, accountName: null }), 'FORBIDDEN', 'NOT_OWNER')
      await expectApp(setDueDay(db, member, houseId, 5), 'FORBIDDEN', 'NOT_OWNER')
      // không đổi gì
      expect((await getHouseSettings(db, owner, houseId)).items.map((i) => i.name)).toEqual(['Xe'])
    })

    it('người ngoài nhà → FORBIDDEN', async () => {
      const { owner, houseId } = await setup()
      const stranger = await newUser('Lạ')
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await expectApp(upsertChargeItem(db, stranger, houseId, { name: 'X', kind: 'equal', amount: 1, active: true }), 'FORBIDDEN')
      await expectApp(deleteChargeItem(db, stranger, xe), 'FORBIDDEN')
      await expectApp(getHouseSettings(db, stranger, houseId), 'FORBIDDEN')
    })

    it('nhà đã lưu trữ chặn mọi thao tác ghi', async () => {
      const { owner, houseId, memberId } = await setup()
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      await db.update(houses).set({ archivedAt: new Date() }).where(eq(houses.id, houseId))
      await expectApp(upsertChargeItem(db, owner, houseId, { name: 'X', kind: 'equal', amount: 1, active: true }), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(deleteChargeItem(db, owner, xe), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(reorderChargeItems(db, owner, houseId, [xe]), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(setMemberQty(db, owner, memberId, xe, 1), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(setUtilityTariff(db, owner, houseId, 'water', { mode: 'total', tariff: null }), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(setBankInfo(db, owner, houseId, { bankBin: null, accountNo: null, accountName: null }), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await expectApp(setDueDay(db, owner, houseId, 5), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      // đọc vẫn được
      expect((await getHouseSettings(db, owner, houseId)).items).toHaveLength(1)
    })
  })

  describe('getHouseSettings', () => {
    it('thành viên đọc được; chỉ trả qty của thành viên đang ở và khoản đang dùng', async () => {
      const { owner, member, houseId, memberId } = await setup()
      const xe = await upsertChargeItem(db, owner, houseId, { name: 'Xe', kind: 'per_unit', amount: 150_000, active: true })
      const gui = await upsertChargeItem(db, owner, houseId, { name: 'Gửi hàng', kind: 'per_unit', amount: 10_000, active: true })
      await setMemberQty(db, owner, memberId, xe, 2)
      await setMemberQty(db, owner, memberId, gui, 3)
      await deleteChargeItem(db, owner, gui)
      const s = await getHouseSettings(db, member, houseId)
      expect(s.qty).toEqual([{ memberId, itemId: xe, qty: 2 }])
      expect(s.dueDay).toBe(10)
      expect(s.tariffs.electricity.mode).toBe('total')
    })
  })
})
