import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { session, user } from '@/db/schema'
import { createTestDb } from '@/db/test-db'
import type { Db } from '@/db'
import { createAuth } from './auth'

describe('Better Auth trên PGlite', () => {
  let db: Db
  let auth: ReturnType<typeof createAuth>
  beforeAll(async () => {
    db = await createTestDb()
    auth = createAuth(db)
    // tài khoản do quản trị viên tạo phía server, gồm cả các cột riêng không cho client tự đặt
    await auth.api.createUser({
      body: {
        email: 'annguyen@nha.local',
        password: 'matkhau-tam-1',
        name: 'An',
        role: 'user',
        data: { username: 'annguyen', accountCode: 'U-12345' },
      },
    })
  }, 30_000)

  async function signIn(username: string, password: string) {
    const res = await auth.api.signInUsername({ body: { username, password }, returnHeaders: true })
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    return new Headers({ cookie })
  }

  it('đăng nhập bằng tên đăng nhập + mật khẩu, session mang các cột riêng', async () => {
    const session = await auth.api.getSession({ headers: await signIn('annguyen', 'matkhau-tam-1') })
    expect(session?.user).toMatchObject({
      username: 'annguyen',
      role: 'user',
      accountCode: 'U-12345',
      mustChangePassword: true,
      avatarVariant: 0,
    })
  })

  it('sai mật khẩu bị từ chối', async () => {
    await expect(signIn('annguyen', 'sai-mat-khau')).rejects.toThrow()
  })

  it('không cho đăng ký công khai', async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: 'la@nha.local', password: 'matkhau-la-1', name: 'Lạ' } }),
    ).rejects.toThrow()
  })

  it('không có cookie thì không có session', async () => {
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull()
  })
  it('đăng ký passkey đòi phiên còn mới: phiên cũ hơn 24 giờ bị 403 SESSION_NOT_FRESH (giữ freshAge mặc định)', async () => {
    const login = await auth.api.signInUsername({ body: { username: 'annguyen', password: 'matkhau-tam-1' }, returnHeaders: true })
    const headers = new Headers({ cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') })
    await expect(auth.api.generatePasskeyRegistrationOptions({ headers, query: { name: 'iPhone' } })).resolves.toBeDefined()

    // đẩy mọi phiên của người này về 25 giờ trước
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.username, 'annguyen'))
    await db.update(session).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(session.userId, owner.id))
    const err = await auth.api.generatePasskeyRegistrationOptions({ headers, query: { name: 'iPhone' } }).catch((e) => e)
    expect(err).toMatchObject({ status: 'FORBIDDEN', body: { code: 'SESSION_NOT_FRESH' } })
  }, 30_000)
})

describe('endpoint /admin/* khi chưa đổi mật khẩu tạm', () => {
  it('phiên của admin còn mustChangePassword bị chặn, đổi xong thì dùng được', async () => {
    const db = await createTestDb()
    const auth = createAuth(db)
    const created = await auth.api.createUser({
      body: {
        email: 'quantri@nha.local',
        password: 'matkhau-quan-tri-1',
        name: 'Quản trị',
        role: 'admin',
        data: { username: 'quantri', accountCode: 'U-00001', mustChangePassword: true },
      },
    })
    const login = await auth.api.signInUsername({
      body: { username: 'quantri', password: 'matkhau-quan-tri-1' },
      returnHeaders: true,
    })
    const headers = new Headers({ cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') })

    await expect(auth.api.listUsers({ headers, query: {} })).rejects.toMatchObject({ body: { code: 'MUST_CHANGE_PASSWORD' } })
    await expect(
      auth.api.createUser({
        headers,
        body: { email: 'x@nha.local', password: 'matkhau-x-12345', name: 'X', role: 'user', data: { username: 'x', accountCode: 'U-00002' } },
      }),
    ).rejects.toMatchObject({ body: { code: 'MUST_CHANGE_PASSWORD' } })

    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, created.user.id))
    await expect(auth.api.listUsers({ headers, query: {} })).resolves.toBeDefined()
  }, 30_000)

  it('mọi yêu cầu HTTP tới /api/auth/admin/* bị chặn, kể cả với phiên quản trị viên (mạo danh, đổi quyền, sửa người dùng)', async () => {
    const db = await createTestDb()
    const auth = createAuth(db)
    await auth.api.createUser({
      body: {
        email: 'qt@nha.local',
        password: 'matkhau-quan-tri-2',
        name: 'Quản trị',
        role: 'admin',
        data: { username: 'qt', accountCode: 'U-00011', mustChangePassword: false },
      },
    })
    const target = await auth.api.createUser({
      body: { email: 'tv@nha.local', password: 'matkhau-thanh-vien', name: 'TV', role: 'user', data: { username: 'tv', accountCode: 'U-00012' } },
    })
    const login = await auth.api.signInUsername({ body: { username: 'qt', password: 'matkhau-quan-tri-2' }, returnHeaders: true })
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const origin = 'http://localhost:3000'
    const post = (path: string, body: unknown) =>
      auth.handler(
        new Request(`${origin}/api/auth/admin/${path}`, {
          method: 'POST',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )

    for (const [path, body] of [
      ['impersonate-user', { userId: target.user.id }],
      ['set-role', { userId: target.user.id, role: 'admin' }],
      ['update-user', { userId: target.user.id, data: { name: 'Hack' } }],
      ['set-user-password', { userId: target.user.id, newPassword: 'matkhau-moi-12345' }],
    ] as const) {
      const res = await post(path, body)
      expect(res.status, path).toBe(403)
    }
    const list = await auth.handler(new Request(`${origin}/api/auth/admin/list-users`, { headers: { cookie, origin } }))
    expect(list.status).toBe(403)

    const [row] = await db.select({ role: user.role, name: user.name }).from(user).where(eq(user.id, target.user.id))
    expect(row).toEqual({ role: 'user', name: 'TV' })
    expect(await db.select().from(session).where(eq(session.userId, target.user.id))).toHaveLength(0)
    // gọi phía server (không qua HTTP, không phiên) như trang /admin vẫn chạy
    await expect(
      auth.api.createUser({
        body: { email: 'moi@nha.local', password: 'matkhau-moi-12345', name: 'Mới', role: 'user', data: { username: 'moi', accountCode: 'U-00013' } },
      }),
    ).resolves.toBeDefined()
  }, 30_000)

})
