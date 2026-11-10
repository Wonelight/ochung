import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin, username } from 'better-auth/plugins'
import { db } from '@/db'
import * as schema from '@/db/schema'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

/** Tạo instance Better Auth trên một DB bất kỳ (production dùng `auth` bên dưới; test dùng DB PGlite). */
export function createAuth(database: Parameters<typeof drizzleAdapter>[0]) {
  return betterAuth({
    baseURL,
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    // Better Auth bắt buộc có email: tài khoản dùng email giả `<username>@nha.local`.
    // Không có đăng ký công khai: quản trị viên tạo tài khoản (plugin admin).
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
    session: { expiresIn: 60 * 60 * 24 * 90 },
    user: {
      additionalFields: {
        accountCode: { type: 'string', required: true, unique: true, input: false },
        mustChangePassword: { type: 'boolean', required: true, defaultValue: true, input: false },
        dob: { type: 'date', required: false },
        avatarVariant: { type: 'number', required: true, defaultValue: 0 },
      },
    },
    hooks: {
      // Endpoint quản trị của plugin admin (/api/auth/admin/*) không qua layout guard: phiên còn mật khẩu tạm bị chặn ở đây.
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.path.startsWith('/admin/')) return
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
      // phải đứng cuối danh sách plugin
      nextCookies(),
    ],
  })
}

export const auth = createAuth(db)
