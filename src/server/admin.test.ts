import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { user } from '@/db/schema'
import { createTestDb } from '@/db/test-db'
import { createAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import type { Actor } from './actor'
import {
  adminCreateUser,
  adminListUsers,
  adminResetPassword,
  adminSetBanned,
  generateAccountCode,
  generateTempPassword,
} from './admin'

describe('generateAccountCode', () => {
  it('sinh mã U- + 5 chữ số', async () => {
    expect(await generateAccountCode(async () => false)).toMatch(/^U-\d{5}$/)
  })

  it('thử lại khi trùng rồi trả mã chưa dùng', async () => {
    let calls = 0
    const code = await generateAccountCode(async () => ++calls < 3)
    expect(calls).toBe(3)
    expect(code).toMatch(/^U-\d{5}$/)
  })

  it('quá 20 lần trùng thì báo lỗi', async () => {
    let calls = 0
    await expect(
      generateAccountCode(async () => {
        calls++
        return true
      }),
    ).rejects.toThrow()
    expect(calls).toBe(20)
  })
})

describe('generateTempPassword', () => {
  it('đủ dài, khác nhau mỗi lần, không có ký tự dễ nhầm', () => {
    const a = generateTempPassword()
    expect(a.length).toBeGreaterThanOrEqual(10)
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
    expect(generateTempPassword()).not.toBe(a)
  })
})

describe('quản trị người dùng', () => {
  let db: Db
  let auth: ReturnType<typeof createAuth>
  let admin: Actor
  const member: Actor = { userId: 'khong-phai-admin', role: 'user' }
  let seq = 0
  const uname = (p: string) => `${p}${Date.now().toString(36)}${seq++}`

  async function signIn(username: string, password: string) {
    return auth.api.signInUsername({ body: { username, password }, returnHeaders: true })
  }
  async function userRow(userId: string) {
    const rows = await adminListUsers(db, admin)
    return rows.find((r) => r.id === userId)
  }

  beforeAll(async () => {
    db = await createTestDb()
    auth = createAuth(db)
    const created = await auth.api.createUser({
      body: {
        email: 'quantri@nha.local',
        password: 'matkhau-quan-tri-1',
        name: 'Quản trị',
        role: 'admin',
        data: { username: 'quantri', accountCode: 'U-00001', mustChangePassword: false },
      },
    })
    admin = { userId: created.user.id, role: 'admin' }
  }, 30_000)

  describe('adminCreateUser', () => {
    it('người không phải admin bị từ chối FORBIDDEN', async () => {
      const err = await adminCreateUser(db, member, { username: uname('x'), displayName: 'X', tempPassword: 'matkhau-tam-1' }, auth).catch(
        (e) => e,
      )
      expect(err).toBeInstanceOf(AppError)
      expect(err.code).toBe('FORBIDDEN')
    })

    it('admin tạo user: mustChangePassword=true, accountCode đúng dạng, đăng nhập được bằng mật khẩu tạm', async () => {
      const username = uname('an')
      const res = await adminCreateUser(db, admin, { username, displayName: 'Nguyễn An', tempPassword: 'matkhau-tam-1' }, auth)
      expect(res.accountCode).toMatch(/^U-\d{5}$/)
      const row = await userRow(res.userId)
      expect(row).toMatchObject({
        username,
        displayName: 'Nguyễn An',
        accountCode: res.accountCode,
        role: 'user',
        banned: false,
      })
      const login = await signIn(username, 'matkhau-tam-1')
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }),
      })
      expect(session?.user).toMatchObject({ id: res.userId, mustChangePassword: true, accountCode: res.accountCode })
    })

    it('tên đăng nhập được chuẩn hóa chữ thường, tạo trùng (kể cả khác hoa/thường) → CONFLICT USERNAME_TAKEN', async () => {
      const username = uname('trung')
      await adminCreateUser(db, admin, { username, displayName: 'Một', tempPassword: 'matkhau-tam-1' }, auth)
      for (const dup of [username, username.toUpperCase()]) {
        const err = await adminCreateUser(db, admin, { username: dup, displayName: 'Hai', tempPassword: 'matkhau-tam-1' }, auth).catch(
          (e) => e,
        )
        expect(err).toBeInstanceOf(AppError)
        expect(err).toMatchObject({ code: 'CONFLICT', reason: 'USERNAME_TAKEN' })
      }
    })

    it.each([
      ['tên đăng nhập quá ngắn', { username: 'a', displayName: 'A', tempPassword: 'matkhau-tam-1' }],
      ['tên đăng nhập có dấu cách', { username: 'an nguyen', displayName: 'A', tempPassword: 'matkhau-tam-1' }],
      ['tên hiển thị rỗng', { username: 'hople', displayName: '   ', tempPassword: 'matkhau-tam-1' }],
      ['mật khẩu tạm dưới 8 ký tự', { username: 'hople', displayName: 'A', tempPassword: '1234567' }],
    ])('đầu vào sai (%s) → INVALID', async (_name, input) => {
      const err = await adminCreateUser(db, admin, input, auth).catch((e) => e)
      expect(err).toBeInstanceOf(AppError)
      expect(err.code).toBe('INVALID')
    })
  })

  describe('adminResetPassword', () => {
    it('người không phải admin bị từ chối', async () => {
      const err = await adminResetPassword(db, member, admin.userId, 'matkhau-tam-2', auth).catch((e) => e)
      expect(err).toMatchObject({ code: 'FORBIDDEN' })
    })

    it('đặt mật khẩu mới, mustChangePassword trở lại true, mật khẩu cũ và phiên cũ mất hiệu lực', async () => {
      const username = uname('reset')
      const { userId } = await adminCreateUser(db, admin, { username, displayName: 'Reset', tempPassword: 'matkhau-cu-1' }, auth)
      const login = await signIn(username, 'matkhau-cu-1')
      const headers = new Headers({ cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') })
      // giả lập người dùng đã đổi mật khẩu xong
      await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, userId))
      expect((await auth.api.getSession({ headers }))?.user.mustChangePassword).toBe(false)

      await adminResetPassword(db, admin, userId, 'matkhau-moi-2', auth)

      expect(await auth.api.getSession({ headers })).toBeNull()
      await expect(signIn(username, 'matkhau-cu-1')).rejects.toThrow()
      const relogin = await signIn(username, 'matkhau-moi-2')
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: relogin.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }),
      })
      expect(session?.user.mustChangePassword).toBe(true)
    })

    it('mật khẩu quá ngắn → INVALID; user không tồn tại → NOT_FOUND', async () => {
      expect(await adminResetPassword(db, admin, admin.userId, '123', auth).catch((e) => e)).toMatchObject({ code: 'INVALID' })
      expect(await adminResetPassword(db, admin, 'khong-co', 'matkhau-moi-2', auth).catch((e) => e)).toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('adminSetBanned', () => {
    it('người không phải admin bị từ chối', async () => {
      const err = await adminSetBanned(db, member, admin.userId, true).catch((e) => e)
      expect(err).toMatchObject({ code: 'FORBIDDEN' })
    })

    it('khóa: không đăng nhập được, phiên bị thu hồi; mở khóa: đăng nhập lại được', async () => {
      const username = uname('khoa')
      const { userId } = await adminCreateUser(db, admin, { username, displayName: 'Khóa', tempPassword: 'matkhau-tam-1' }, auth)
      const login = await signIn(username, 'matkhau-tam-1')
      const headers = new Headers({ cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') })

      await adminSetBanned(db, admin, userId, true)
      expect((await userRow(userId))?.banned).toBe(true)
      expect(await auth.api.getSession({ headers })).toBeNull()
      await expect(signIn(username, 'matkhau-tam-1')).rejects.toThrow()

      await adminSetBanned(db, admin, userId, false)
      expect((await userRow(userId))?.banned).toBe(false)
      await expect(signIn(username, 'matkhau-tam-1')).resolves.toBeDefined()
    })

    it('không tự khóa mình; user không tồn tại → NOT_FOUND', async () => {
      expect(await adminSetBanned(db, admin, admin.userId, true).catch((e) => e)).toMatchObject({
        code: 'INVALID',
        reason: 'CANNOT_BAN_SELF',
      })
      expect(await adminSetBanned(db, admin, 'khong-co', true).catch((e) => e)).toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  describe('adminListUsers', () => {
    it('người không phải admin bị từ chối', async () => {
      expect(await adminListUsers(db, member).catch((e) => e)).toMatchObject({ code: 'FORBIDDEN' })
    })

    it('trả đủ trường, quản trị viên đứng trong danh sách', async () => {
      const rows = await adminListUsers(db, admin)
      const me = rows.find((r) => r.id === admin.userId)
      expect(me).toMatchObject({
        username: 'quantri',
        displayName: 'Quản trị',
        accountCode: 'U-00001',
        role: 'admin',
        banned: false,
      })
      expect(me?.createdAt).toBeInstanceOf(Date)
    })
  })
})
