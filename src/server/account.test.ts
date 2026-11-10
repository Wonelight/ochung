import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { createTestDb } from '@/db/test-db'
import { createAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { changeOwnPassword } from './account'
import { adminCreateUser } from './admin'

describe('changeOwnPassword (đổi mật khẩu lần đầu)', () => {
  let db: Db
  let auth: ReturnType<typeof createAuth>
  let admin: { userId: string; role: 'admin' }
  let seq = 0

  async function newMember(password = 'matkhau-tam-1') {
    const username = `thanhvien${seq++}`
    const { userId } = await adminCreateUser(db, admin, { username, displayName: 'TV', tempPassword: password }, auth)
    const login = await auth.api.signInUsername({ body: { username, password }, returnHeaders: true })
    const headers = new Headers({ cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') })
    return { username, userId, headers }
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

  it('đổi mật khẩu, tắt mustChangePassword, mật khẩu cũ hết dùng', async () => {
    const m = await newMember()
    await changeOwnPassword(db, m.headers, { currentPassword: 'matkhau-tam-1', newPassword: 'matkhau-rieng-2' }, auth)

    await expect(auth.api.signInUsername({ body: { username: m.username, password: 'matkhau-tam-1' } })).rejects.toThrow()
    const relogin = await auth.api.signInUsername({
      body: { username: m.username, password: 'matkhau-rieng-2' },
      returnHeaders: true,
    })
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: relogin.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }),
    })
    expect(session?.user.mustChangePassword).toBe(false)
  })

  it('mật khẩu hiện tại sai → INVALID và mustChangePassword vẫn true', async () => {
    const m = await newMember()
    const err = await changeOwnPassword(db, m.headers, { currentPassword: 'sai-roi-nhe', newPassword: 'matkhau-rieng-2' }, auth).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: 'INVALID', reason: 'WRONG_CURRENT_PASSWORD' })
    const session = await auth.api.getSession({ headers: m.headers })
    expect(session?.user.mustChangePassword).toBe(true)
  })

  it('mật khẩu mới ngắn hoặc trùng mật khẩu cũ → INVALID', async () => {
    const m = await newMember()
    expect(
      await changeOwnPassword(db, m.headers, { currentPassword: 'matkhau-tam-1', newPassword: '1234567' }, auth).catch((e) => e),
    ).toMatchObject({ code: 'INVALID', reason: 'PASSWORD_LENGTH' })
    expect(
      await changeOwnPassword(db, m.headers, { currentPassword: 'matkhau-tam-1', newPassword: 'matkhau-tam-1' }, auth).catch((e) => e),
    ).toMatchObject({ code: 'INVALID', reason: 'PASSWORD_UNCHANGED' })
  })

  it('không có phiên → FORBIDDEN', async () => {
    const err = await changeOwnPassword(db, new Headers(), { currentPassword: 'a', newPassword: 'matkhau-rieng-2' }, auth).catch((e) => e)
    expect(err).toMatchObject({ code: 'FORBIDDEN' })
  })
})
