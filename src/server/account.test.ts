import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db'
import { createTestDb } from '@/db/test-db'
import { user } from '@/db/schema'
import { createAuth } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { changeOwnPassword, readOwnProfile, shuffleOwnAvatar, updateOwnProfile } from './account'
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

describe('hồ sơ cá nhân (Cài đặt)', () => {
  let db: Db
  let auth: ReturnType<typeof createAuth>
  let admin: { userId: string; role: 'admin' }
  let seq = 0

  async function newActor() {
    const username = `hoso${seq++}`
    const { userId } = await adminCreateUser(db, admin, { username, displayName: 'Hồ Sơ', tempPassword: 'matkhau-tam-1' }, auth)
    return { userId, role: 'user' as const }
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

  const NOW = new Date('2026-11-10T03:00:00Z') // 10:00 ngày 10/11/2026 giờ Việt Nam

  it('đổi tên hiển thị (cắt khoảng trắng) và ngày sinh; readOwnProfile trả lại', async () => {
    const a = await newActor()
    await updateOwnProfile(db, a, { name: '  Minh Phạm  ', dob: '1996-03-14' }, NOW)
    expect(await readOwnProfile(db, a)).toMatchObject({ name: 'Minh Phạm', dob: '1996-03-14', avatarVariant: 0 })
    await updateOwnProfile(db, a, { name: 'Minh', dob: '' }, NOW)
    expect(await readOwnProfile(db, a)).toMatchObject({ name: 'Minh', dob: null })
  })

  it('tên rỗng hoặc dài hơn 50 ký tự → INVALID', async () => {
    const a = await newActor()
    expect(await updateOwnProfile(db, a, { name: '   ', dob: '' }, NOW).catch((e) => e)).toMatchObject({ code: 'INVALID', reason: 'NAME_LENGTH' })
    expect(await updateOwnProfile(db, a, { name: 'a'.repeat(51), dob: '' }, NOW).catch((e) => e)).toMatchObject({
      code: 'INVALID',
      reason: 'NAME_LENGTH',
    })
    await updateOwnProfile(db, a, { name: 'a'.repeat(50), dob: '' }, NOW)
  })

  it('ngày sinh sai định dạng, không tồn tại hoặc ở tương lai → INVALID; hôm nay thì được', async () => {
    const a = await newActor()
    for (const dob of ['14/03/1996', '1996-02-30', '2026-11-11', '1899-12-31']) {
      const err = await updateOwnProfile(db, a, { name: 'An', dob }, NOW).catch((e) => e)
      expect(err, dob).toMatchObject({ code: 'INVALID', reason: 'DOB_INVALID' })
    }
    await updateOwnProfile(db, a, { name: 'An', dob: '2026-11-10' }, NOW)
    expect((await readOwnProfile(db, a)).dob).toBe('2026-11-10')
  })

  it('"Tạo hình mới" tăng avatarVariant thêm 1 mỗi lần', async () => {
    const a = await newActor()
    expect(await shuffleOwnAvatar(db, a)).toBe(1)
    expect(await shuffleOwnAvatar(db, a)).toBe(2)
    expect((await readOwnProfile(db, a)).avatarVariant).toBe(2)
  })

  it('không đụng tới vai trò, mã tài khoản, tên đăng nhập; chỉ sửa đúng người của actor', async () => {
    const a = await newActor()
    const other = await newActor()
    const [rowBefore] = await db.select().from(user).where(eq(user.id, a.userId))
    await updateOwnProfile(db, a, { name: 'Tên mới', dob: '2000-01-01', role: 'admin', accountCode: 'U-99999', username: 'hacker' } as never, NOW)
    const [rowAfter] = await db.select().from(user).where(eq(user.id, a.userId))
    expect(rowAfter).toMatchObject({ role: rowBefore.role, accountCode: rowBefore.accountCode, username: rowBefore.username })
    expect(rowAfter.name).toBe('Tên mới')
    expect((await readOwnProfile(db, other)).name).toBe('Hồ Sơ')
  })
})
