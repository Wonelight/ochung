import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { houseMembers, houses, payments, periods, user, utilityTariffs } from '@/db/schema'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import {
  addMemberTx,
  archiveHouse,
  createHouse,
  generateHouseCode,
  getHouse,
  houseCodePrefix,
  leaveHouse,
  listMembers,
  listMyHouses,
  removeMember,
  requireMember,
  requireOwner,
  updateHouse,
} from './houses'

describe('nhà và thành viên', () => {
  let db: Db
  let seq = 0

  beforeAll(async () => {
    db = await createTestDb()
  }, 30_000)

  async function newUser(name = 'Người dùng'): Promise<Actor & { name: string }> {
    const n = seq++
    const id = newId()
    await db.insert(user).values({ id, name, email: `u${n}@nha.local`, accountCode: `U-${String(n).padStart(5, '0')}` })
    return { userId: id, role: 'user', name }
  }

  async function houseWithMember(ownerName = 'Chủ', memberName = 'An') {
    const owner = await newUser(ownerName)
    const member = await newUser(memberName)
    const { houseId, code } = await createHouse(db, owner, { name: 'Nhà Cầu Giấy' })
    const added = await db.transaction((tx) => addMemberTx(tx, houseId, member.userId))
    return { owner, member, houseId, code, memberRowId: added.id }
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

  describe('createHouse', () => {
    it('người tạo là chủ nhà, mã đúng định dạng, có bảng giá điện nước mặc định chế độ total', async () => {
      const owner = await newUser('Minh')
      const { houseId, code } = await createHouse(db, owner, { name: '  Nhà Cầu Giấy  ' })

      expect(code).toMatch(/^[A-Z]{2}-[A-HJ-NP-Z2-9]{4}$/)
      expect(code.startsWith('CG-')).toBe(true)
      expect(await listMyHouses(db, owner)).toEqual([{ houseId, name: 'Nhà Cầu Giấy', role: 'owner', archived: false }])

      const members = await listMembers(db, owner, houseId)
      expect(members).toHaveLength(1)
      expect(members[0]).toMatchObject({ userId: owner.userId, role: 'owner', sortOrder: 0, displayName: 'Minh', leftAt: null })

      const tariffs = await db.select().from(utilityTariffs).where(eq(utilityTariffs.houseId, houseId))
      expect(tariffs.map((t) => [t.utility, t.mode]).sort()).toEqual([
        ['electricity', 'total'],
        ['water', 'total'],
      ])
    })

    it('từ chối tên rỗng hoặc quá dài', async () => {
      const owner = await newUser()
      await rejects(createHouse(db, owner, { name: '   ' }), 'INVALID', 'HOUSE_NAME')
      await rejects(createHouse(db, owner, { name: 'x'.repeat(61) }), 'INVALID', 'HOUSE_NAME')
    })
  })

  describe('mã nhà', () => {
    it('chữ cái đầu của hai từ cuối, bỏ dấu; một từ lấy hai chữ đầu; không có chữ thì NH', () => {
      expect(houseCodePrefix('Nhà Cầu Giấy')).toBe('CG')
      expect(houseCodePrefix('Căn hộ Đông Anh')).toBe('DA')
      expect(houseCodePrefix('Ơn')).toBe('ON')
      expect(houseCodePrefix('A')).toBe('NH')
      expect(houseCodePrefix('123 !!')).toBe('NH')
    })

    it('thử lại khi trùng và dừng sau số lần giới hạn', async () => {
      const seen: string[] = []
      const code = await generateHouseCode(async (c) => {
        seen.push(c)
        return seen.length < 3
      }, 'CG')
      expect(seen).toHaveLength(3)
      expect(code).toBe(seen[2])
      await expect(generateHouseCode(async () => true)).rejects.toThrow()
    })

    it('không dùng ký tự dễ nhầm 0, O, 1, I', async () => {
      for (let i = 0; i < 200; i++) {
        expect(await generateHouseCode(async () => false)).toMatch(/^NH-[A-HJ-NP-Z2-9]{4}$/)
      }
    })
  })

  describe('updateHouse', () => {
    it('chủ nhà sửa được tên, hạn đóng, tài khoản ngân hàng', async () => {
      const { owner, houseId } = await houseWithMember()
      await updateHouse(db, owner, houseId, {
        name: 'Nhà Mới',
        dueDay: 15,
        bankBin: '970436',
        bankAccountNo: '0011004',
        bankAccountName: 'NGUYEN VAN MINH',
      })
      const [h] = await db.select().from(houses).where(eq(houses.id, houseId))
      expect(h).toMatchObject({
        name: 'Nhà Mới',
        dueDay: 15,
        bankBin: '970436',
        bankAccountNo: '0011004',
        bankAccountName: 'NGUYEN VAN MINH',
      })
      await updateHouse(db, owner, houseId, { bankBin: null, bankAccountNo: '' })
      const [cleared] = await db.select().from(houses).where(eq(houses.id, houseId))
      expect(cleared.bankBin).toBeNull()
      expect(cleared.bankAccountNo).toBeNull()
      expect(cleared.bankAccountName).toBe('NGUYEN VAN MINH')
    })

    it('thành viên sửa → FORBIDDEN và dữ liệu không đổi', async () => {
      const { member, houseId } = await houseWithMember()
      await rejects(updateHouse(db, member, houseId, { name: 'Hack' }), 'FORBIDDEN', 'NOT_OWNER')
      const [h] = await db.select().from(houses).where(eq(houses.id, houseId))
      expect(h.name).toBe('Nhà Cầu Giấy')
    })

    it('người ngoài sửa → FORBIDDEN', async () => {
      const { houseId } = await houseWithMember()
      const stranger = await newUser()
      await rejects(updateHouse(db, stranger, houseId, { name: 'Hack' }), 'FORBIDDEN', 'NOT_MEMBER')
    })

    it('hạn đóng ngoài 1–28 hoặc không nguyên → INVALID', async () => {
      const { owner, houseId } = await houseWithMember()
      await rejects(updateHouse(db, owner, houseId, { dueDay: 29 }), 'INVALID', 'DUE_DAY')
      await rejects(updateHouse(db, owner, houseId, { dueDay: 0 }), 'INVALID', 'DUE_DAY')
      await rejects(updateHouse(db, owner, houseId, { dueDay: 10.5 }), 'INVALID', 'DUE_DAY')
      await updateHouse(db, owner, houseId, { dueDay: 28 })
    })

    it('tên rỗng và ngân hàng sai định dạng → INVALID', async () => {
      const { owner, houseId } = await houseWithMember()
      await rejects(updateHouse(db, owner, houseId, { name: ' ' }), 'INVALID', 'HOUSE_NAME')
      await rejects(updateHouse(db, owner, houseId, { bankBin: '12ab' }), 'INVALID', 'BANK_FIELD')
      await rejects(updateHouse(db, owner, houseId, { bankAccountNo: '12 34' }), 'INVALID', 'BANK_FIELD')
    })
  })

  describe('archiveHouse', () => {
    it('lưu trữ: listMyHouses archived, requireOwner bị chặn, requireMember vẫn được', async () => {
      const { owner, member, houseId } = await houseWithMember()
      await archiveHouse(db, owner, houseId)

      expect((await listMyHouses(db, owner))[0]).toMatchObject({ houseId, archived: true })
      await rejects(requireOwner(db, owner, houseId), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      await rejects(updateHouse(db, owner, houseId, { name: 'Sửa' }), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      expect((await requireMember(db, owner, houseId)).role).toBe('owner')
      expect((await requireMember(db, member, houseId)).role).toBe('member')
      expect(await listMembers(db, member, houseId)).toHaveLength(2)
    })

    it('thành viên không lưu trữ được nhà', async () => {
      const { member, houseId } = await houseWithMember()
      await rejects(archiveHouse(db, member, houseId), 'FORBIDDEN', 'NOT_OWNER')
      expect((await listMyHouses(db, member))[0].archived).toBe(false)
    })

    async function closedPeriod(houseId: string, memberId: string, due: number) {
      const periodId = newId()
      await db.insert(periods).values({
        id: periodId,
        houseId,
        year: 2026,
        month: 10,
        status: 'closed',
        dueDate: '2026-11-10',
        result: {
          electricity: null,
          water: null,
          grandTotal: due,
          payslips: [{ memberId, lines: [], share: due, advanced: 0, due }],
        },
      })
      return periodId
    }

    it('còn tháng đã chốt chưa thu đủ → CONFLICT, force thì lưu trữ', async () => {
      const { owner, houseId, memberRowId } = await houseWithMember()
      await closedPeriod(houseId, memberRowId, 500_000)

      await rejects(archiveHouse(db, owner, houseId), 'CONFLICT', 'UNSETTLED_PERIODS')
      expect((await listMyHouses(db, owner))[0].archived).toBe(false)

      await archiveHouse(db, owner, houseId, { force: true })
      expect((await listMyHouses(db, owner))[0].archived).toBe(true)
    })

    it('đã thu đủ thì lưu trữ không cần force', async () => {
      const { owner, houseId, memberRowId } = await houseWithMember()
      const periodId = await closedPeriod(houseId, memberRowId, 500_000)
      await db.insert(payments).values({
        id: newId(),
        periodId,
        memberId: memberRowId,
        direction: 'in',
        amount: 500_000,
        status: 'confirmed',
        createdBy: owner.userId,
      })
      await archiveHouse(db, owner, houseId)
      expect((await listMyHouses(db, owner))[0].archived).toBe(true)
    })
  })

  describe('getHouse', () => {
    it('thành viên đọc được thông tin nhà, người ngoài thì không', async () => {
      const { member, houseId, code } = await houseWithMember()
      expect(await getHouse(db, member, houseId)).toMatchObject({ id: houseId, name: 'Nhà Cầu Giấy', code, dueDay: 10, archived: false })
      const stranger = await newUser()
      await rejects(getHouse(db, stranger, houseId), 'FORBIDDEN', 'NOT_MEMBER')
    })
  })

  describe('listMyHouses', () => {
    it('nhà đang dùng trước, nhà lưu trữ sau, mỗi nhóm theo tên; bỏ nhà đã rời', async () => {
      const me = await newUser()
      const b = await createHouse(db, me, { name: 'Bình' })
      const a = await createHouse(db, me, { name: 'An' })
      const z = await createHouse(db, me, { name: 'Ân Cư' })
      const other = await newUser()
      const { houseId: left } = await createHouse(db, other, { name: 'Cũ' })
      await db.transaction((tx) => addMemberTx(tx, left, me.userId))
      await leaveHouse(db, me, left)
      await archiveHouse(db, me, a.houseId)

      const list = await listMyHouses(db, me)
      expect(list.map((h) => [h.name, h.archived])).toEqual([
        ['Ân Cư', false],
        ['Bình', false],
        ['An', true],
      ])
      expect(list.map((h) => h.houseId)).toEqual([z.houseId, b.houseId, a.houseId])
    })
  })

  describe('thành viên', () => {
    it('addMemberTx cấp sortOrder tăng dần và từ chối thêm hai lần', async () => {
      const { owner, member, houseId } = await houseWithMember()
      const third = await newUser('Bình')
      const added = await db.transaction((tx) => addMemberTx(tx, houseId, third.userId))
      expect(added).toMatchObject({ role: 'member', sortOrder: 2, displayName: 'Bình' })

      const list = await listMembers(db, owner, houseId)
      expect(list.map((m) => [m.displayName, m.sortOrder])).toEqual([
        ['Chủ', 0],
        ['An', 1],
        ['Bình', 2],
      ])
      await rejects(
        db.transaction((tx) => addMemberTx(tx, houseId, member.userId)),
        'CONFLICT',
        'ALREADY_MEMBER',
      )
    })

    it('removeMember: khỏi listMembers nhưng dòng vẫn còn với leftAt', async () => {
      const { owner, member, houseId, memberRowId } = await houseWithMember()
      await removeMember(db, owner, houseId, memberRowId)

      expect((await listMembers(db, owner, houseId)).map((m) => m.userId)).toEqual([owner.userId])
      const [row] = await db.select().from(houseMembers).where(eq(houseMembers.id, memberRowId))
      expect(row.leftAt).toBeInstanceOf(Date)
      await rejects(requireMember(db, member, houseId), 'FORBIDDEN', 'NOT_MEMBER')
      expect(await listMyHouses(db, member)).toEqual([])
    })

    it('removeMember: thành viên không xóa được ai; không xóa được chủ nhà; id lạ → NOT_FOUND', async () => {
      const { owner, member, houseId, memberRowId } = await houseWithMember()
      const [ownerRow] = await listMembers(db, owner, houseId)
      await rejects(removeMember(db, member, houseId, ownerRow.id), 'FORBIDDEN', 'NOT_OWNER')
      await rejects(removeMember(db, owner, houseId, ownerRow.id), 'CONFLICT', 'CANNOT_REMOVE_OWNER')
      await rejects(removeMember(db, owner, houseId, 'khong-co'), 'NOT_FOUND', 'MEMBER_NOT_FOUND')
      // thành viên của nhà khác không bị xóa nhầm qua houseId của nhà mình
      const other = await houseWithMember()
      await rejects(removeMember(db, owner, houseId, other.memberRowId), 'NOT_FOUND', 'MEMBER_NOT_FOUND')
      expect(await listMembers(db, owner, houseId)).toHaveLength(2)
      expect(memberRowId).toBeTruthy()
    })

    it('thêm lại người đã rời: có dòng mới, dòng cũ giữ nguyên', async () => {
      const { owner, member, houseId, memberRowId } = await houseWithMember()
      await removeMember(db, owner, houseId, memberRowId)
      const again = await db.transaction((tx) => addMemberTx(tx, houseId, member.userId))
      expect(again.id).not.toBe(memberRowId)
      const rows = await db.select().from(houseMembers).where(eq(houseMembers.userId, member.userId))
      expect(rows.filter((r) => r.houseId === houseId)).toHaveLength(2)
    })

    it('leaveHouse: thành viên rời được', async () => {
      const { owner, member, houseId } = await houseWithMember()
      await leaveHouse(db, member, houseId)
      expect((await listMembers(db, owner, houseId)).map((m) => m.userId)).toEqual([owner.userId])
    })

    it('leaveHouse bởi chủ nhà → CONFLICT OWNER_CANNOT_LEAVE', async () => {
      const { owner, houseId } = await houseWithMember()
      await rejects(leaveHouse(db, owner, houseId), 'CONFLICT', 'OWNER_CANNOT_LEAVE')
      expect((await requireMember(db, owner, houseId)).role).toBe('owner')
    })

    it('leaveHouse khi còn nợ tháng đã chốt → CONFLICT HAS_BALANCE', async () => {
      const { member, houseId, memberRowId } = await houseWithMember()
      await db.insert(periods).values({
        id: newId(),
        houseId,
        year: 2026,
        month: 10,
        status: 'closed',
        dueDate: '2026-11-10',
        result: {
          electricity: null,
          water: null,
          grandTotal: 100_000,
          payslips: [{ memberId: memberRowId, lines: [], share: 100_000, advanced: 0, due: 100_000 }],
        },
      })
      await rejects(leaveHouse(db, member, houseId), 'CONFLICT', 'HAS_BALANCE')
      expect((await requireMember(db, member, houseId)).role).toBe('member')
    })

    it('người ngoài gọi listMembers → FORBIDDEN', async () => {
      const { houseId } = await houseWithMember()
      const stranger = await newUser()
      await rejects(listMembers(db, stranger, houseId), 'FORBIDDEN', 'NOT_MEMBER')
    })

    it('quản trị viên không phải thành viên cũng không xem được', async () => {
      const { houseId } = await houseWithMember()
      const admin: Actor = { userId: (await newUser()).userId, role: 'admin' }
      await rejects(listMembers(db, admin, houseId), 'FORBIDDEN', 'NOT_MEMBER')
    })
  })
})
