import { passkey } from '@better-auth/passkey'
import { waitUntil } from '@vercel/functions'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin, emailOTP, username } from 'better-auth/plugins'
import { and, eq, like, notLike, or } from 'drizzle-orm'
import { db, type Db } from '@/db'
import * as schema from '@/db/schema'
import { OTP_MINUTES, renderExistingAccountMail, renderOtpMail } from '@/server/mail-templates'
import { sendMail as realSendMail, type SendMail } from '@/server/mailer'
import { generateAccountCode } from './account-code'
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_RULE_MESSAGE,
  isPlaceholderEmail,
  PASSWORD_MAX,
  PLACEHOLDER_EMAIL_DOMAIN,
  PASSWORD_MIN,
  USERNAME_PATTERN,
  USERNAME_RULE_MESSAGE,
} from './account-rules'
import { googleCredentials } from './google-env'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

/**
 * Tạo instance Better Auth trên một DB bất kỳ (production dùng `auth` bên dưới; test dùng DB PGlite).
 * `deps.sendMail`: nơi gửi thư (mặc định gửi thật qua SMTP); test truyền hàm ghi lại để đọc mã OTP.
 */
export function createAuth(database: Parameters<typeof drizzleAdapter>[0], deps: { sendMail?: SendMail } = {}) {
  const google = googleCredentials()
  const sendMail = deps.sendMail ?? realSendMail
  const sqlDb = database as Db
  return betterAuth({
    baseURL,
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    // Ba loại tài khoản cùng tồn tại:
    //  1. tự đăng ký bằng email thật + tên đăng nhập + mật khẩu: phải nhập mã OTP 6 số gửi tới email mới đăng nhập được;
    //  2. đăng nhập Google: email do Google xác nhận sẵn;
    //  3. quản trị viên cấp: email giả `<tên>@nha.local` (không gửi thư tới đó), coi như đã xác nhận.
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      // đặt lại mật khẩu bằng mã OTP là người dùng tự chọn mật khẩu mới, nên bỏ cờ "phải đổi mật khẩu tạm"
      onPasswordReset: async ({ user }) => {
        await sqlDb.update(schema.user).set({ mustChangePassword: false }).where(eq(schema.user.id, user.id))
      },
      // có người đăng ký bằng email đã có tài khoản: báo cho chủ email (người đăng ký không biết gì để không dò được email nào đã dùng)
      onExistingUserSignUp: async ({ user }) => {
        if (!isPlaceholderEmail(user.email)) await sendMail(renderExistingAccountMail(user.email))
      },
    },
    emailVerification: {
      // đăng nhập khi chưa xác nhận: gửi lại mã (màn đăng nhập chuyển sang bước nhập mã); nhập đúng mã thì vào luôn
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    // Chỉ đăng ký provider Google khi đã có khóa; chưa có thì bỏ qua để app vẫn chạy.
    socialProviders: google ? { google: { ...google, prompt: 'select_account' } } : {},
    account: {
      accountLinking: {
        // Không tự gộp tài khoản Google vào tài khoản có cùng email: chỉ gộp khi người đang đăng nhập chủ động bấm
        // "Liên kết Google" trong Cài đặt (linkSocial).
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        trustedProviders: ['google'],
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 90 },
    // Trên Vercel, gửi thư chạy nền (không chặn phản hồi, tránh lộ thời gian "email có tồn tại") nhưng vẫn được chờ cho xong.
    advanced: process.env.VERCEL ? { backgroundTasks: { handler: waitUntil } } : {},
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            const data = { ...newUser } as typeof newUser & { accountCode?: string; mustChangePassword?: boolean }
            // Email giả của tài khoản quản trị viên cấp không nhận được thư, nên không thể "xác nhận": coi như đã xác nhận,
            // nếu không `requireEmailVerification` sẽ khóa họ khỏi đăng nhập.
            if (isPlaceholderEmail(newUser.email)) data.emailVerified = true
            // Người dùng tự đăng ký (mật khẩu hoặc Google) chưa có mã tài khoản: cấp mã, và không bắt đổi mật khẩu
            // (họ tự chọn mật khẩu hoặc không có mật khẩu). Tài khoản quản trị viên tạo đã mang sẵn mã và giữ nguyên cờ.
            if (!data.accountCode) {
              data.accountCode = await generateAccountCode(
                async (code) => (await sqlDb.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.accountCode, code)).limit(1)).length > 0,
              )
              data.mustChangePassword = false
            }
            return { data }
          },
        },
      },
    },
    user: {
      additionalFields: {
        // `required: false` chỉ ở lớp Better Auth (nó kiểm trường bắt buộc ngay khi đọc body đăng ký, trước hook tạo user).
        // Cột DB vẫn NOT NULL; hook `databaseHooks.user.create.before` cấp mã cho mọi tài khoản chưa có.
        accountCode: { type: 'string', required: false, unique: true, input: false },
        mustChangePassword: { type: 'boolean', required: true, defaultValue: true, input: false },
        dob: { type: 'date', required: false },
        avatarVariant: { type: 'number', required: true, defaultValue: 0 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email') {
          const body = (ctx.body ?? {}) as { username?: unknown; name?: unknown; email?: unknown }
          const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
          const name = typeof body.name === 'string' ? body.name.trim() : ''
          const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
          if (!USERNAME_PATTERN.test(username)) throw APIError.from('BAD_REQUEST', { code: 'USERNAME_FORMAT', message: USERNAME_RULE_MESSAGE })
          if (name.length < 1 || name.length > DISPLAY_NAME_MAX) throw APIError.from('BAD_REQUEST', { code: 'DISPLAY_NAME', message: DISPLAY_NAME_RULE_MESSAGE })
          // đuôi email giả dành riêng cho tài khoản do quản trị viên cấp (không nhận được thư)
          if (isPlaceholderEmail(email)) throw APIError.from('BAD_REQUEST', { code: 'EMAIL_RESERVED', message: 'Hãy dùng email thật của bạn' })
          // Dọn các lần đăng ký dở (chưa nhập mã OTP) trùng email hoặc tên đăng nhập: chúng không đăng nhập được, nhưng nếu
          // giữ lại thì người đăng ký sau (chính chủ email) bị chặn mãi. Chỉ xóa tài khoản chưa xác nhận và không phải email giả.
          await sqlDb
            .delete(schema.user)
            .where(
              and(
                eq(schema.user.emailVerified, false),
                notLike(schema.user.email, `%@${PLACEHOLDER_EMAIL_DOMAIN}`), // tài khoản quản trị viên cấp không bao giờ bị dọn
                or(eq(schema.user.email, email), eq(schema.user.username, username)),
              ),
            )
            .catch(() => undefined)
          return { context: { ...ctx, body: { ...ctx.body, username, name, email } } }
        }
        if (ctx.path === '/sign-in/username') {
          // Tự chữa: tài khoản do quản trị viên cấp (email giả, không xác nhận được) phải luôn được coi là đã xác nhận, nếu không
          // `requireEmailVerification` khóa họ. Migration 0003 làm việc này cho dữ liệu cũ; đây là lưới an toàn khi mã mới chạy
          // trước migration (ví dụ Vercel deploy ngay khi push) để không ai bị khóa khỏi đăng nhập.
          const raw = (ctx.body as { username?: unknown } | undefined)?.username
          const name = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
          if (name) {
            await sqlDb
              .update(schema.user)
              .set({ emailVerified: true })
              .where(and(eq(schema.user.username, name), like(schema.user.email, `%@${PLACEHOLDER_EMAIL_DOMAIN}`), eq(schema.user.emailVerified, false)))
              .catch(() => undefined)
          }
          return
        }
        if (!ctx.path.startsWith('/admin/')) return
        // Endpoint HTTP của plugin admin (/api/auth/admin/*) bị chặn hết: vai trò admin mặc định cho phép mạo danh, đổi quyền,
        // sửa/xóa người dùng — mạo danh thì quản trị viên đọc được tiền của mọi nhà (trái spec §2). Trang /admin chỉ gọi
        // `auth.api.*` phía server (không có `ctx.request`), nên không bị ảnh hưởng.
        if (ctx.request) {
          throw APIError.from('FORBIDDEN', { code: 'ADMIN_HTTP_DISABLED', message: 'Thao tác quản trị chỉ làm được trong trang /admin' })
        }
        // lời gọi phía server có kèm phiên còn mật khẩu tạm cũng bị chặn
        const session = await getSessionFromCtx(ctx)
        if (session?.user.mustChangePassword === true) {
          throw APIError.from('FORBIDDEN', { code: 'MUST_CHANGE_PASSWORD', message: 'Bạn cần đổi mật khẩu trước khi tiếp tục' })
        }
      }),
    },
    plugins: [
      username({ minUsernameLength: 2 }), // tên ngắn như "an", "vy" là bình thường trong một nhà
      admin(),
      passkey({ rpID: new URL(baseURL).hostname, rpName: 'Chi tiêu nhà' }),
      // Mã OTP 6 số qua email thay cho link: app cài lên màn hình chính, bấm link thường mở sang trình duyệt khác và mất phiên.
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_MINUTES * 60,
        allowedAttempts: 5,
        overrideDefaultEmailVerification: true, // xác nhận email lúc đăng ký cũng dùng OTP thay vì link
        changeEmail: { enabled: true }, // tài khoản cũ (email giả) thêm "Email khôi phục" bằng OTP gửi tới email mới
        async sendVerificationOTP({ email, otp, type }) {
          await sendMail(renderOtpMail(email, type, otp))
        },
      }),
      // phải đứng cuối danh sách plugin
      nextCookies(),
    ],
  })
}

export const auth = createAuth(db)
