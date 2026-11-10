import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from './ids'
import { createTestDb } from './test-db'
import { houseMembers, houses, joinRequests, payments, periods, user } from './schema'
import type { Db } from './index'

async function seed(db: Db) {
  const userId = newId()
  await db.insert(user).values({
    id: userId,
    name: 'Chủ nhà',
    email: `${userId}@nha.local`,
    username: userId,
    accountCode: `U-${userId}`,
  })
  const houseId = newId()
  await db.insert(houses).values({ id: houseId, name: 'Nhà A', code: houseId, ownerUserId: userId })
  const memberId = newId()
  await db.insert(houseMembers).values({ id: memberId, houseId, userId, role: 'owner', sortOrder: 0 })
  return { userId, houseId, memberId }
}

describe('createTestDb', () => {
  // Một DB cho cả file (khởi tạo PGlite ~1,5 giây); mỗi test seed dữ liệu có khóa riêng nên không đụng nhau.
  let db: Db
  beforeAll(async () => {
    db = await createTestDb()
  }, 30_000)

  it('chạy migrations và cho chèn user + nhà + thành viên', async () => {
    const { houseId, userId } = await seed(db)
    const rows = await db.select().from(houseMembers).where(eq(houseMembers.houseId, houseId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ houseId, userId, role: 'owner', leftAt: null })
    const [u] = await db.select().from(user).where(eq(user.id, userId))
    expect(u.mustChangePassword).toBe(true)
    expect(u.avatarVariant).toBe(0)
  })

  it('mỗi lần gọi là một DB mới, độc lập', async () => {
    const a = await createTestDb()
    const b = await createTestDb()
    await seed(a)
    expect(await b.select().from(user)).toHaveLength(0)
  }, 30_000)

  it('chặn thành viên trùng (cùng nhà, cùng user, chưa rời)', async () => {
    const { houseId, userId } = await seed(db)
    await expect(
      db.insert(houseMembers).values({ id: newId(), houseId, userId, role: 'member', sortOrder: 1 }),
    ).rejects.toThrow()
  })

  it('cho vào lại nhà sau khi đã rời', async () => {
    const { houseId, userId } = await seed(db)
    await db.update(houseMembers).set({ leftAt: new Date() }).where(eq(houseMembers.houseId, houseId))
    await db.insert(houseMembers).values({ id: newId(), houseId, userId, role: 'member', sortOrder: 1 })
    expect(await db.select().from(houseMembers).where(eq(houseMembers.houseId, houseId))).toHaveLength(2)
  })

  it('chỉ một yêu cầu vào nhà đang chờ cho mỗi (nhà, user)', async () => {
    const { houseId, userId } = await seed(db)
    await db.insert(joinRequests).values({ id: newId(), houseId, userId })
    await expect(db.insert(joinRequests).values({ id: newId(), houseId, userId })).rejects.toThrow()
    await db.update(joinRequests).set({ status: 'rejected' }).where(eq(joinRequests.houseId, houseId))
    await db.insert(joinRequests).values({ id: newId(), houseId, userId })
  })

  it('chặn 2 khoản thu "in" đang chờ cho cùng (tháng, thành viên)', async () => {
    const { houseId, userId, memberId } = await seed(db)
    const periodId = newId()
    await db.insert(periods).values({ id: periodId, houseId, year: 2026, month: 11, dueDate: '2026-12-10' })
    const pay = (over: Partial<typeof payments.$inferInsert> = {}) => ({
      id: newId(),
      periodId,
      memberId,
      direction: 'in' as const,
      amount: 1_000_000,
      createdBy: userId,
      ...over,
    })
    await db.insert(payments).values(pay())
    await expect(db.insert(payments).values(pay())).rejects.toThrow()
    // chiều 'out' và trạng thái khác không bị chặn
    await db.insert(payments).values(pay({ direction: 'out' }))
    await db.insert(payments).values(pay({ status: 'confirmed' }))
  })

  it('chặn tháng trùng (nhà, năm, tháng)', async () => {
    const { houseId } = await seed(db)
    const row = () => ({ id: newId(), houseId, year: 2026, month: 11, dueDate: '2026-12-10' })
    await db.insert(periods).values(row())
    await expect(db.insert(periods).values(row())).rejects.toThrow()
  })

  it('lưu số tiền lớn dạng bigint (number) chính xác', async () => {
    const { houseId, userId, memberId } = await seed(db)
    const periodId = newId()
    await db.insert(periods).values({ id: periodId, houseId, year: 2026, month: 11, dueDate: '2026-12-10' })
    await db
      .insert(payments)
      .values({ id: newId(), periodId, memberId, direction: 'in', amount: 9_876_543_210, createdBy: userId })
    const [p] = await db.select().from(payments).where(eq(payments.periodId, periodId))
    expect(p.amount).toBe(9_876_543_210)
  })
})
