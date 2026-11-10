import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { createTestDb } from '@/db/test-db'
import { houseMembers, houses, inviteLinks, joinRequests, user } from '@/db/schema'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import { addMemberTx, archiveHouse, createHouse, isUniqueViolation, listMembers, removeMember } from './houses'
import {
  acceptInvite,
  addMemberByAccountCode,
  cancelJoinRequest,
  createInviteLink,
  decideJoinRequest,
  listInviteLinks,
  listJoinRequests,
  listMyJoinRequests,
  requestJoinByCode,
  revokeInviteLink,
} from './invites'

const DAY = 24 * 60 * 60 * 1000

describe('ba cách vào nhà', () => {
  let db: Db
  let seq = 0

  beforeAll(async () => {
    db = await createTestDb()
  }, 30_000)

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function newUser(name = 'Người dùng'): Promise<Actor & { name: string; accountCode: string }> {
    const n = seq++
    const id = newId()
    const accountCode = `U-${String(n).padStart(5, '0')}`
    await db.insert(user).values({ id, name, email: `u${n}@nha.local`, accountCode })
    return { userId: id, role: 'user', name, accountCode }
  }

  async function newHouse(name = 'Nhà Cầu Giấy') {
    const owner = await newUser('Chủ nhà')
    const { houseId, code } = await createHouse(db, owner, { name })
    return { owner, houseId, code }
  }

  async function activeMembers(houseId: string) {
    return db
      .select()
      .from(houseMembers)
      .where(and(eq(houseMembers.houseId, houseId), isNull(houseMembers.leftAt)))
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

  describe('link mời', () => {
    it('createInviteLink: token 32 ký tự URL-an toàn, hạn 7 ngày, url theo BETTER_AUTH_URL', async () => {
      vi.stubEnv('BETTER_AUTH_URL', 'https://nha.example/')
      const { owner, houseId } = await newHouse()
      const before = Date.now()
      const link = await createInviteLink(db, owner, houseId)

      expect(link.token).toMatch(/^[A-Za-z0-9]{32}$/)
      expect(link.url).toBe(`https://nha.example/moi/${link.token}`)
      expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY)
      expect(link.expiresAt.getTime()).toBeLessThan(Date.now() + 7 * DAY + 1000)
      const second = await createInviteLink(db, owner, houseId)
      expect(second.token).not.toBe(link.token)
    })

    it('thành viên, người ngoài tạo link → FORBIDDEN', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const member = await newUser()
      await acceptInvite(db, member, link.token)
      await rejects(createInviteLink(db, member, houseId), 'FORBIDDEN', 'NOT_OWNER')
      await rejects(createInviteLink(db, await newUser(), houseId), 'FORBIDDEN', 'NOT_MEMBER')
    })

    it('nhà đã lưu trữ → HOUSE_ARCHIVED, không tạo link mới', async () => {
      const { owner, houseId } = await newHouse()
      await archiveHouse(db, owner, houseId)
      await rejects(createInviteLink(db, owner, houseId), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      expect(await db.select().from(inviteLinks).where(eq(inviteLinks.houseId, houseId))).toHaveLength(0)
    })

    it('listInviteLinks: chủ nhà thấy link mới nhất trước, có cờ revoked; thành viên bị chặn', async () => {
      const { owner, houseId } = await newHouse()
      const a = await createInviteLink(db, owner, houseId)
      const b = await createInviteLink(db, owner, houseId)
      await revokeInviteLink(db, owner, a.id)

      const list = await listInviteLinks(db, owner, houseId)
      expect(list.map((l) => [l.id, l.revoked])).toEqual([
        [b.id, false],
        [a.id, true],
      ])
      expect(list[0].url).toBe(b.url)
      expect(list[0].expiresAt).toBeInstanceOf(Date)

      const member = await newUser()
      await acceptInvite(db, member, b.token)
      await rejects(listInviteLinks(db, member, houseId), 'FORBIDDEN', 'NOT_OWNER')
    })

    it('revokeInviteLink: link bị hủy thì acceptInvite → INVITE_REVOKED; hủy hai lần không lỗi', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      await revokeInviteLink(db, owner, link.id)
      await revokeInviteLink(db, owner, link.id)

      const guest = await newUser()
      await rejects(acceptInvite(db, guest, link.token), 'CONFLICT', 'INVITE_REVOKED')
      expect(await activeMembers(houseId)).toHaveLength(1)
    })

    it('revokeInviteLink: id lạ → INVITE_NOT_FOUND; chủ nhà khác hoặc thành viên không hủy được', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      await rejects(revokeInviteLink(db, owner, 'khong-co'), 'NOT_FOUND', 'INVITE_NOT_FOUND')

      const other = await newHouse('Nhà Khác')
      await rejects(revokeInviteLink(db, other.owner, link.id), 'FORBIDDEN', 'NOT_MEMBER')
      const member = await newUser()
      await acceptInvite(db, member, link.token)
      await rejects(revokeInviteLink(db, member, link.id), 'FORBIDDEN', 'NOT_OWNER')
      const [row] = await db.select().from(inviteLinks).where(eq(inviteLinks.id, link.id))
      expect(row.revokedAt).toBeNull()
    })

    it('acceptInvite: một link dùng được cho hai người khác nhau, sortOrder tăng dần', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const an = await newUser('An')
      const binh = await newUser('Bình')

      expect(await acceptInvite(db, an, link.token)).toEqual({ houseId })
      expect(await acceptInvite(db, binh, link.token)).toEqual({ houseId })

      const members = await listMembers(db, owner, houseId)
      expect(members.map((m) => [m.displayName, m.role, m.sortOrder])).toEqual([
        ['Chủ nhà', 'owner', 0],
        ['An', 'member', 1],
        ['Bình', 'member', 2],
      ])
    })

    it('acceptInvite gọi hai lần chỉ tạo một member, lần hai trả houseId', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const an = await newUser('An')
      await acceptInvite(db, an, link.token)
      expect(await acceptInvite(db, an, link.token)).toEqual({ houseId })
      expect((await activeMembers(houseId)).filter((m) => m.userId === an.userId)).toHaveLength(1)
    })

    it('acceptInvite song song cùng một người: vẫn một member, cả hai lời gọi thành công', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const an = await newUser('An')
      const results = await Promise.all([acceptInvite(db, an, link.token), acceptInvite(db, an, link.token)])
      expect(results).toEqual([{ houseId }, { houseId }])
      expect((await activeMembers(houseId)).filter((m) => m.userId === an.userId)).toHaveLength(1)
    })

    it('acceptInvite: token lạ → INVITE_NOT_FOUND', async () => {
      await rejects(acceptInvite(db, await newUser(), 'x'.repeat(32)), 'NOT_FOUND', 'INVITE_NOT_FOUND')
      await rejects(acceptInvite(db, await newUser(), ''), 'NOT_FOUND', 'INVITE_NOT_FOUND')
    })

    it('acceptInvite: link hết hạn → INVITE_EXPIRED, không tạo member', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      await db
        .update(inviteLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(inviteLinks.id, link.id))
      await rejects(acceptInvite(db, await newUser(), link.token), 'CONFLICT', 'INVITE_EXPIRED')
      expect(await activeMembers(houseId)).toHaveLength(1)
    })

    it('acceptInvite: người đã là thành viên bấm lại link đã hết hạn thì vẫn trả houseId', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const an = await newUser()
      await acceptInvite(db, an, link.token)
      await db
        .update(inviteLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(inviteLinks.id, link.id))
      expect(await acceptInvite(db, an, link.token)).toEqual({ houseId })
    })

    it('acceptInvite: nhà đã lưu trữ → HOUSE_ARCHIVED', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      await archiveHouse(db, owner, houseId)
      await rejects(acceptInvite(db, await newUser(), link.token), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      expect(await activeMembers(houseId)).toHaveLength(1)
    })

    it('acceptInvite: người từng bị xóa vào lại bằng link được, dòng cũ giữ nguyên', async () => {
      const { owner, houseId } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const an = await newUser()
      await acceptInvite(db, an, link.token)
      const [row] = (await activeMembers(houseId)).filter((m) => m.userId === an.userId)
      await removeMember(db, owner, houseId, row.id)
      await acceptInvite(db, an, link.token)
      const rows = await db.select().from(houseMembers).where(eq(houseMembers.userId, an.userId))
      expect(rows).toHaveLength(2)
      expect(rows.filter((r) => r.leftAt === null)).toHaveLength(1)
    })

    it('acceptInvite: đang chờ duyệt mà vào bằng link thì yêu cầu chờ được đóng lại', async () => {
      const { owner, houseId, code } = await newHouse()
      const link = await createInviteLink(db, owner, houseId)
      const an = await newUser()
      await requestJoinByCode(db, an, code)
      await acceptInvite(db, an, link.token)
      expect(await listJoinRequests(db, owner, houseId)).toEqual([])
      expect(await listMyJoinRequests(db, an)).toEqual([])
    })
  })

  describe('mã nhà + chủ nhà duyệt', () => {
    async function houseWithCode(code = 'CG-7K2Q') {
      const h = await newHouse()
      await db.update(houses).set({ code }).where(eq(houses.id, h.houseId))
      return { ...h, code }
    }

    it('nhập "cg-7k2q " (thường, thừa khoảng trắng) vẫn tìm thấy nhà CG-7K2Q', async () => {
      const { houseId } = await houseWithCode('CG-7K2Q')
      const an = await newUser('An')
      const res = await requestJoinByCode(db, an, 'cg-7k2q ')
      expect(res.houseName).toBe('Nhà Cầu Giấy')
      const [row] = await db.select().from(joinRequests).where(eq(joinRequests.id, res.requestId))
      expect(row).toMatchObject({ houseId, userId: an.userId, status: 'pending' })

      const binh = await newUser('Bình')
      expect((await requestJoinByCode(db, binh, '  Cg 7k2q')).houseName).toBe('Nhà Cầu Giấy')
      const chi = await newUser('Chi')
      expect((await requestJoinByCode(db, chi, 'cg7k2q')).houseName).toBe('Nhà Cầu Giấy')
    })

    it('mã không có → HOUSE_CODE_NOT_FOUND (kể cả mã rỗng)', async () => {
      await houseWithCode('AB-2340')
      await rejects(requestJoinByCode(db, await newUser(), 'ZZ-9999'), 'NOT_FOUND', 'HOUSE_CODE_NOT_FOUND')
      await rejects(requestJoinByCode(db, await newUser(), '   '), 'NOT_FOUND', 'HOUSE_CODE_NOT_FOUND')
    })

    it('đã là thành viên → ALREADY_MEMBER, không tạo yêu cầu', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2345')
      await rejects(requestJoinByCode(db, owner, code), 'CONFLICT', 'ALREADY_MEMBER')
      expect(await db.select().from(joinRequests).where(eq(joinRequests.houseId, houseId))).toHaveLength(0)
    })

    it('gửi lần hai khi còn chờ → REQUEST_PENDING, vẫn một yêu cầu', async () => {
      const { houseId, code } = await houseWithCode('AB-2346')
      const an = await newUser()
      await requestJoinByCode(db, an, code)
      await rejects(requestJoinByCode(db, an, code), 'CONFLICT', 'REQUEST_PENDING')
      expect(await db.select().from(joinRequests).where(eq(joinRequests.houseId, houseId))).toHaveLength(1)
    })

    it('nhà đã lưu trữ → HOUSE_ARCHIVED', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2347')
      await archiveHouse(db, owner, houseId)
      await rejects(requestJoinByCode(db, await newUser(), code), 'FORBIDDEN', 'HOUSE_ARCHIVED')
    })

    it('listJoinRequests: chủ nhà thấy yêu cầu đang chờ (tên, thời điểm), thành viên bị chặn', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2348')
      const an = await newUser('An')
      const binh = await newUser('Bình')
      const first = await requestJoinByCode(db, an, code)
      const second = await requestJoinByCode(db, binh, code)
      await cancelJoinRequest(db, binh, second.requestId)

      const list = await listJoinRequests(db, owner, houseId)
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: first.requestId, userId: an.userId, displayName: 'An' })
      expect(list[0].createdAt).toBeInstanceOf(Date)

      await rejects(listJoinRequests(db, an, houseId), 'FORBIDDEN', 'NOT_MEMBER')
    })

    it('listMyJoinRequests: yêu cầu đang chờ của chính mình kèm tên và mã nhà', async () => {
      const { code } = await houseWithCode('AB-2349')
      const an = await newUser('An')
      const { requestId } = await requestJoinByCode(db, an, code)
      expect(await listMyJoinRequests(db, an)).toEqual([{ id: requestId, houseName: 'Nhà Cầu Giấy', houseCode: code }])
      await cancelJoinRequest(db, an, requestId)
      expect(await listMyJoinRequests(db, an)).toEqual([])
    })

    it('cancelJoinRequest: người gửi hủy được và gửi lại được; người khác hủy → NOT_FOUND; đã hủy → CONFLICT', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2350')
      const an = await newUser()
      const { requestId } = await requestJoinByCode(db, an, code)
      await rejects(cancelJoinRequest(db, await newUser(), requestId), 'NOT_FOUND', 'REQUEST_NOT_FOUND')
      await rejects(cancelJoinRequest(db, owner, requestId), 'NOT_FOUND', 'REQUEST_NOT_FOUND')

      await cancelJoinRequest(db, an, requestId)
      const [row] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId))
      expect(row.status).toBe('cancelled')
      expect(row.decidedAt).toBeInstanceOf(Date)
      await rejects(cancelJoinRequest(db, an, requestId), 'CONFLICT', 'REQUEST_NOT_PENDING')
      await rejects(decideJoinRequest(db, owner, requestId, 'approve'), 'CONFLICT', 'REQUEST_NOT_PENDING')
      expect(await activeMembers(houseId)).toHaveLength(1)

      await requestJoinByCode(db, an, code)
    })

    it('approve tạo member; yêu cầu chuyển sang approved', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2351')
      const an = await newUser('An')
      const { requestId } = await requestJoinByCode(db, an, code)
      await decideJoinRequest(db, owner, requestId, 'approve')

      const members = await listMembers(db, owner, houseId)
      expect(members.map((m) => [m.displayName, m.role, m.sortOrder])).toEqual([
        ['Chủ nhà', 'owner', 0],
        ['An', 'member', 1],
      ])
      const [row] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId))
      expect(row.status).toBe('approved')
      expect(row.decidedAt).toBeInstanceOf(Date)
    })

    it('reject không tạo member; sau đó người đó gửi lại được', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2352')
      const an = await newUser('An')
      const { requestId } = await requestJoinByCode(db, an, code)
      await decideJoinRequest(db, owner, requestId, 'reject')

      expect(await activeMembers(houseId)).toHaveLength(1)
      const [row] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId))
      expect(row.status).toBe('rejected')
      await requestJoinByCode(db, an, code)
    })

    it('thành viên (và người ngoài) gọi decideJoinRequest → FORBIDDEN, yêu cầu vẫn chờ', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2353')
      const member = await newUser('Thành viên')
      await db.transaction((tx) => addMemberTx(tx, houseId, member.userId))
      const guest = await newUser('Khách')
      const { requestId } = await requestJoinByCode(db, guest, code)

      await rejects(decideJoinRequest(db, member, requestId, 'approve'), 'FORBIDDEN', 'NOT_OWNER')
      await rejects(decideJoinRequest(db, guest, requestId, 'approve'), 'FORBIDDEN', 'NOT_MEMBER')
      const [row] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId))
      expect(row.status).toBe('pending')
      expect(await activeMembers(houseId)).toHaveLength(2)
      await decideJoinRequest(db, owner, requestId, 'approve')
    })

    it('chủ nhà khác không duyệt được yêu cầu nhà này', async () => {
      const { houseId, code } = await houseWithCode('AB-2354')
      const { owner: stranger } = await newHouse('Nhà Khác')
      const { requestId } = await requestJoinByCode(db, await newUser(), code)
      await rejects(decideJoinRequest(db, stranger, requestId, 'approve'), 'FORBIDDEN', 'NOT_MEMBER')
      expect(await activeMembers(houseId)).toHaveLength(1)
    })

    it('duyệt hai lần → CONFLICT REQUEST_NOT_PENDING và chỉ một member; id lạ → REQUEST_NOT_FOUND', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2355')
      const { requestId } = await requestJoinByCode(db, await newUser(), code)
      await decideJoinRequest(db, owner, requestId, 'approve')
      await rejects(decideJoinRequest(db, owner, requestId, 'approve'), 'CONFLICT', 'REQUEST_NOT_PENDING')
      await rejects(decideJoinRequest(db, owner, requestId, 'reject'), 'CONFLICT', 'REQUEST_NOT_PENDING')
      await rejects(decideJoinRequest(db, owner, 'khong-co', 'approve'), 'NOT_FOUND', 'REQUEST_NOT_FOUND')
      expect(await activeMembers(houseId)).toHaveLength(2)
    })

    it('nhà lưu trữ sau khi có yêu cầu: duyệt → HOUSE_ARCHIVED, không có member mới', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2356')
      const { requestId } = await requestJoinByCode(db, await newUser(), code)
      await archiveHouse(db, owner, houseId)
      await rejects(decideJoinRequest(db, owner, requestId, 'approve'), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      expect(await activeMembers(houseId)).toHaveLength(1)
    })

    it('đã vào bằng cách khác trong lúc chờ: duyệt vẫn thành công và không tạo member trùng', async () => {
      const { owner, houseId, code } = await houseWithCode('AB-2357')
      const an = await newUser()
      const { requestId } = await requestJoinByCode(db, an, code)
      await db.transaction((tx) => addMemberTx(tx, houseId, an.userId))
      await decideJoinRequest(db, owner, requestId, 'approve')
      expect((await activeMembers(houseId)).filter((m) => m.userId === an.userId)).toHaveLength(1)
      const [row] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId))
      expect(row.status).toBe('approved')
    })
  })

  describe('thêm bằng mã tài khoản', () => {
    it('thêm thẳng người có mã, không phân biệt hoa thường và khoảng trắng', async () => {
      const { owner, houseId } = await newHouse()
      const an = await newUser('An')
      const added = await addMemberByAccountCode(db, owner, houseId, ` ${an.accountCode.toLowerCase()} `)
      expect(added).toMatchObject({ userId: an.userId, houseId, role: 'member', sortOrder: 1, displayName: 'An', leftAt: null })
      expect((await activeMembers(houseId)).map((m) => m.userId)).toContain(an.userId)
    })

    it('mã không có → ACCOUNT_NOT_FOUND', async () => {
      const { owner, houseId } = await newHouse()
      await rejects(addMemberByAccountCode(db, owner, houseId, 'U-99999'), 'NOT_FOUND', 'ACCOUNT_NOT_FOUND')
      await rejects(addMemberByAccountCode(db, owner, houseId, ''), 'NOT_FOUND', 'ACCOUNT_NOT_FOUND')
    })

    it('đã là thành viên → ALREADY_MEMBER', async () => {
      const { owner, houseId } = await newHouse()
      const an = await newUser()
      await addMemberByAccountCode(db, owner, houseId, an.accountCode)
      await rejects(addMemberByAccountCode(db, owner, houseId, an.accountCode), 'CONFLICT', 'ALREADY_MEMBER')
      await rejects(addMemberByAccountCode(db, owner, houseId, owner.accountCode), 'CONFLICT', 'ALREADY_MEMBER')
      expect(await activeMembers(houseId)).toHaveLength(2)
    })

    it('thành viên, người ngoài thêm → FORBIDDEN; nhà lưu trữ → HOUSE_ARCHIVED', async () => {
      const { owner, houseId } = await newHouse()
      const member = await newUser()
      await addMemberByAccountCode(db, owner, houseId, member.accountCode)
      const target = await newUser()
      await rejects(addMemberByAccountCode(db, member, houseId, target.accountCode), 'FORBIDDEN', 'NOT_OWNER')
      await rejects(addMemberByAccountCode(db, target, houseId, target.accountCode), 'FORBIDDEN', 'NOT_MEMBER')
      await archiveHouse(db, owner, houseId)
      await rejects(addMemberByAccountCode(db, owner, houseId, target.accountCode), 'FORBIDDEN', 'HOUSE_ARCHIVED')
      expect(await activeMembers(houseId)).toHaveLength(2)
    })

    it('người đang chờ duyệt được thêm thẳng thì yêu cầu chờ được đóng lại', async () => {
      const { owner, houseId, code } = await newHouse()
      const an = await newUser()
      await requestJoinByCode(db, an, code)
      await addMemberByAccountCode(db, owner, houseId, an.accountCode)
      expect(await listJoinRequests(db, owner, houseId)).toEqual([])
    })
  })

  describe('addMemberTx (an toàn khi nhiều người vào cùng lúc)', () => {
    it('từ chối nhà đã lưu trữ và nhà không tồn tại', async () => {
      const { owner, houseId } = await newHouse()
      await archiveHouse(db, owner, houseId)
      const an = await newUser()
      await rejects(
        db.transaction((tx) => addMemberTx(tx, houseId, an.userId)),
        'FORBIDDEN',
        'HOUSE_ARCHIVED',
      )
      await rejects(
        db.transaction((tx) => addMemberTx(tx, 'khong-co', an.userId)),
        'NOT_FOUND',
        'HOUSE_NOT_FOUND',
      )
    })

    it('nhiều người vào song song vẫn được sortOrder khác nhau, liên tục', async () => {
      const { owner, houseId } = await newHouse()
      const guests = await Promise.all([newUser(), newUser(), newUser(), newUser(), newUser()])
      await Promise.all(guests.map((g) => db.transaction((tx) => addMemberTx(tx, houseId, g.userId))))
      const orders = (await activeMembers(houseId)).map((m) => m.sortOrder).sort((a, b) => a - b)
      expect(orders).toEqual([0, 1, 2, 3, 4, 5])
      expect(await listMembers(db, owner, houseId)).toHaveLength(6)
    })

    it('isUniqueViolation nhận ra vi phạm chỉ mục duy nhất của Postgres (kể cả bọc trong lỗi drizzle)', async () => {
      const { houseId, owner } = await newHouse()
      const dup = db.insert(houseMembers).values({ id: newId(), houseId, userId: owner.userId, role: 'member', sortOrder: 9 })
      const err = await dup.then(
        () => null,
        (e: unknown) => e,
      )
      expect(err).not.toBeNull()
      expect(isUniqueViolation(err)).toBe(true)
      expect(isUniqueViolation(new Error('khác'))).toBe(false)
      expect(isUniqueViolation(null)).toBe(false)
    })
  })
})
