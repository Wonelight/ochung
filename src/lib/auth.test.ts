import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { session, user } from '@/db/schema'
import { createTestDb } from '@/db/test-db'
import type { Db } from '@/db'
import type { Mail } from '@/server/mailer'
import { createAuth } from './auth'

describe('Better Auth trên PGlite', () => {
  let db: Db
  let auth: ReturnType<typeof createAuth>
  // thư app "gửi" trong test: không gửi thật, chỉ ghi lại để đọc mã OTP
  const mails: Mail[] = []
  /** Mã OTP trong thư gần nhất gửi tới `email`. */
  function otpFor(email: string): string {
    const mail = [...mails].reverse().find((m) => m.to === email && /Mã của bạn: \d{6}/.test(m.text))
    if (!mail) throw new Error(`Chưa có thư mã OTP nào gửi tới ${email}`)
    return /Mã của bạn: (\d{6})/.exec(mail.text)![1]
  }
  beforeAll(async () => {
    db = await createTestDb()
    auth = createAuth(db, { sendMail: async (m) => void mails.push(m) })
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

  describe('tự đăng ký: email thật + mã OTP 6 số', () => {
    const signUp = (body: { username: string; name: string; password: string; email: string } & Record<string, unknown>) =>
      auth.api.signUpEmail({ body: body as never, returnHeaders: true })

    it('đăng ký chưa có phiên: gửi mã 6 số tới email, đăng nhập bị chặn tới khi nhập đúng mã, nhập đúng thì vào luôn', async () => {
      const res = await signUp({ username: 'Minh.Pham', name: '  Minh  ', password: 'matkhau-minh-1', email: 'Minh@Example.com' })
      expect(res.headers.getSetCookie()).toHaveLength(0) // chưa đăng nhập
      expect(otpFor('minh@example.com')).toMatch(/^\d{6}$/)

      await expect(signIn('minh.pham', 'matkhau-minh-1')).rejects.toMatchObject({ status: 'FORBIDDEN', body: { code: 'EMAIL_NOT_VERIFIED' } })
      // đăng nhập khi chưa xác nhận cũng gửi lại mã mới
      const code = otpFor('minh@example.com')
      await expect(auth.api.verifyEmailOTP({ body: { email: 'minh@example.com', otp: code === '000000' ? '111111' : '000000' } })).rejects.toMatchObject({ body: { code: 'INVALID_OTP' } })

      const verified = await auth.api.verifyEmailOTP({ body: { email: 'minh@example.com', otp: otpFor('minh@example.com') }, returnHeaders: true })
      const cookie = verified.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
      const me = await auth.api.getSession({ headers: new Headers({ cookie }) })
      expect(me?.user).toMatchObject({ username: 'minh.pham', name: 'Minh', email: 'minh@example.com', emailVerified: true, role: 'user', mustChangePassword: false })
      expect(me?.user.accountCode).toMatch(/^U-\d{5}$/)
      await expect(signIn('minh.pham', 'matkhau-minh-1')).resolves.toBeInstanceOf(Headers)
    })

    it('mã dùng được đúng một lần', async () => {
      await signUp({ username: 'mot.lan', name: 'Một', password: 'matkhau-mot-1', email: 'motlan@example.com' })
      const code = otpFor('motlan@example.com')
      await auth.api.verifyEmailOTP({ body: { email: 'motlan@example.com', otp: code } })
      await expect(auth.api.verifyEmailOTP({ body: { email: 'motlan@example.com', otp: code } })).rejects.toThrow()
    })

    it('từ chối email giả của hệ thống, tên đăng nhập sai quy tắc, tên rỗng, mật khẩu ngắn, tên đã dùng', async () => {
      const base = { name: 'A', password: 'matkhau-a-12345' }
      await expect(signUp({ ...base, username: 'hople', email: 'x@nha.local' })).rejects.toMatchObject({ body: { code: 'EMAIL_RESERVED' } })
      await expect(signUp({ ...base, username: 'Có Dấu', email: 'a1@example.com' })).rejects.toMatchObject({ body: { code: 'USERNAME_FORMAT' } })
      await expect(signUp({ ...base, username: 'a', email: 'a2@example.com' })).rejects.toMatchObject({ body: { code: 'USERNAME_FORMAT' } })
      await expect(signUp({ ...base, name: '   ', username: 'hople', email: 'a3@example.com' })).rejects.toMatchObject({ body: { code: 'DISPLAY_NAME' } })
      await expect(signUp({ ...base, username: 'ngan', email: 'a4@example.com', password: '123' })).rejects.toThrow()
      await expect(signUp({ ...base, username: 'annguyen', email: 'a5@example.com' })).rejects.toThrow() // trùng tài khoản do quản trị viên cấp
    })

    it('không tự cấp quyền admin hay tự đặt mã tài khoản', async () => {
      await expect(signUp({ username: 'leo', name: 'Leo', password: 'matkhau-leo-1', email: 'leo@example.com', accountCode: 'U-99999' })).rejects.toThrow()
      await expect(signUp({ username: 'leo2', name: 'Leo', password: 'matkhau-leo-1', email: 'leo2@example.com', role: 'admin' })).rejects.toThrow()
      expect(await db.select({ id: user.id }).from(user).where(eq(user.username, 'leo'))).toHaveLength(0)
    })

    it('đăng ký dở (chưa nhập mã) không chặn chính chủ đăng ký lại bằng cùng email hoặc cùng tên đăng nhập', async () => {
      await signUp({ username: 'dodang', name: 'Dở', password: 'matkhau-do-1234', email: 'dodang@example.com' })
      // cùng email, tên khác
      await signUp({ username: 'dodang2', name: 'Dở', password: 'matkhau-do-5678', email: 'dodang@example.com' })
      // cùng tên, email khác
      await signUp({ username: 'dodang2', name: 'Dở', password: 'matkhau-do-9012', email: 'dodang3@example.com' })
      const rows = await db.select({ username: user.username, email: user.email }).from(user).where(eq(user.name, 'Dở'))
      expect(rows).toEqual([{ username: 'dodang2', email: 'dodang3@example.com' }])
    })

    it('đăng ký bằng email đã có tài khoản: trả kết quả giống hệt, không tạo thêm tài khoản, chủ email nhận thư báo', async () => {
      await signUp({ username: 'chinhchu', name: 'Chính chủ', password: 'matkhau-chu-1', email: 'chinhchu@example.com' })
      await auth.api.verifyEmailOTP({ body: { email: 'chinhchu@example.com', otp: otpFor('chinhchu@example.com') } })
      mails.length = 0
      const res = await signUp({ username: 'kekhac', name: 'Kẻ khác', password: 'matkhau-khac-1', email: 'chinhchu@example.com' })
      expect(res.response.token).toBeNull()
      expect(await db.select({ id: user.id }).from(user).where(eq(user.username, 'kekhac'))).toHaveLength(0)
      expect(mails.map((m) => m.to)).toEqual(['chinhchu@example.com'])
      expect(mails[0].subject).toMatch(/đăng ký/)
      expect(mails[0].text).not.toMatch(/\d{6}/) // thư báo không chứa mã
    })
  })

  describe('quên mật khẩu bằng mã OTP', () => {
    async function memberWithEmail(username: string, email: string, password: string) {
      await auth.api.signUpEmail({ body: { username, name: username, password, email } as never })
      await auth.api.verifyEmailOTP({ body: { email, otp: otpFor(email) } })
    }

    it('nhập đúng mã thì đặt được mật khẩu mới: mật khẩu cũ hết dùng, phiên cũ bị thu hồi', async () => {
      await memberWithEmail('quenmk', 'quenmk@example.com', 'matkhau-cu-1234')
      const oldSession = await signIn('quenmk', 'matkhau-cu-1234')
      mails.length = 0
      await auth.api.requestPasswordResetEmailOTP({ body: { email: 'quenmk@example.com' } })
      expect(mails).toHaveLength(1)
      await expect(auth.api.resetPasswordEmailOTP({ body: { email: 'quenmk@example.com', otp: '000000', password: 'matkhau-moi-1234' } })).rejects.toThrow()
      await auth.api.resetPasswordEmailOTP({ body: { email: 'quenmk@example.com', otp: otpFor('quenmk@example.com'), password: 'matkhau-moi-1234' } })
      await expect(signIn('quenmk', 'matkhau-cu-1234')).rejects.toThrow()
      await expect(signIn('quenmk', 'matkhau-moi-1234')).resolves.toBeInstanceOf(Headers)
      expect(await auth.api.getSession({ headers: oldSession })).toBeNull()
    })

    it('email không có tài khoản: vẫn báo thành công, không gửi thư (không lộ email nào đã đăng ký)', async () => {
      mails.length = 0
      await expect(auth.api.requestPasswordResetEmailOTP({ body: { email: 'khong-co@example.com' } })).resolves.toEqual({ success: true })
      expect(mails).toHaveLength(0)
    })

    it('đặt lại xong thì bỏ cờ phải đổi mật khẩu tạm', async () => {
      // tài khoản riêng (không đụng `annguyen` mà các test khác dùng): quản trị viên cấp, còn mật khẩu tạm
      await auth.api.createUser({
        body: { email: 'tam@nha.local', password: 'matkhau-tam-9999', name: 'Tạm', role: 'user', data: { username: 'matkhautam', accountCode: 'U-65432' } },
      })
      await db.update(user).set({ email: 'matkhautam@example.com' }).where(eq(user.username, 'matkhautam'))
      await auth.api.requestPasswordResetEmailOTP({ body: { email: 'matkhautam@example.com' } })
      await auth.api.resetPasswordEmailOTP({ body: { email: 'matkhautam@example.com', otp: otpFor('matkhautam@example.com'), password: 'matkhau-rieng-1' } })
      const [row] = await db.select({ must: user.mustChangePassword }).from(user).where(eq(user.username, 'matkhautam'))
      expect(row.must).toBe(false)
    })
  })

  describe('thêm email khôi phục cho tài khoản cũ (email giả)', () => {
    it('xác nhận bằng mã gửi tới email mới: email được đổi, sau đó quên mật khẩu dùng được', async () => {
      await auth.api.createUser({
        body: { email: 'cu@nha.local', password: 'matkhau-cu-9999', name: 'Cũ', role: 'user', data: { username: 'taikhoancu', accountCode: 'U-54321' } },
      })
      const headers = await signIn('taikhoancu', 'matkhau-cu-9999')
      await auth.api.requestEmailChangeEmailOTP({ headers, body: { newEmail: 'Cu.That@Example.com' } })
      await expect(auth.api.changeEmailEmailOTP({ headers, body: { newEmail: 'cu.that@example.com', otp: '000000' } })).rejects.toThrow()
      await auth.api.changeEmailEmailOTP({ headers, body: { newEmail: 'cu.that@example.com', otp: otpFor('cu.that@example.com') } })
      const [row] = await db.select({ email: user.email, verified: user.emailVerified }).from(user).where(eq(user.username, 'taikhoancu'))
      expect(row).toEqual({ email: 'cu.that@example.com', verified: true })

      mails.length = 0
      await auth.api.requestPasswordResetEmailOTP({ body: { email: 'cu.that@example.com' } })
      expect(mails.map((m) => m.to)).toEqual(['cu.that@example.com'])
    })
  })

  it('tài khoản quản trị viên cấp mà DB chưa kịp đánh dấu đã xác nhận (chưa chạy migration) vẫn đăng nhập được', async () => {
    await db.update(user).set({ emailVerified: false }).where(eq(user.username, 'annguyen'))
    await expect(signIn('annguyen', 'matkhau-tam-1')).resolves.toBeInstanceOf(Headers)
    const [row] = await db.select({ verified: user.emailVerified }).from(user).where(eq(user.username, 'annguyen'))
    expect(row.verified).toBe(true)
  })

  it('tài khoản quản trị viên tạo vẫn giữ mã và cờ mustChangePassword như đã đặt', async () => {
    const [row] = await db.select({ code: user.accountCode, must: user.mustChangePassword }).from(user).where(eq(user.username, 'annguyen'))
    expect(row).toEqual({ code: 'U-12345', must: true })
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
