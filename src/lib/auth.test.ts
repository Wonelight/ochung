import { beforeAll, describe, expect, it } from 'vitest'
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
})
