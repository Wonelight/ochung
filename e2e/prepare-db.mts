// Chạy trước `next dev` của e2e (xem playwright.config.ts): xóa DB pglite cũ, áp migration và tạo quản trị viên.
// Tạo quản trị viên bằng chính instance Better Auth của app (cùng đường với `npx auth@latest create-admin`).
// PGlite chỉ cho một tiến trình mở thư mục dữ liệu, nên script đóng DB trước khi server khởi động.
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'

const url = process.env.DATABASE_URL
if (!url?.startsWith('pglite:')) throw new Error('e2e chỉ chạy trên DB pglite (DATABASE_URL=pglite:./.data/e2e)')
rmSync(path.resolve(url.slice('pglite:'.length)), { recursive: true, force: true })

execSync('npx tsx scripts/migrate.mts', { stdio: 'inherit' })

const { getDb } = await import('../src/db/index')
const { auth } = await import('../src/lib/auth')
await auth.api.createUser({
  body: {
    email: 'admin@nha.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'quan-tri-e2e-1',
    name: 'Quản trị',
    role: 'admin',
    data: { username: 'admin', accountCode: 'U-00001', mustChangePassword: false },
  },
})
await (getDb() as unknown as { $client: PGlite }).$client.close()
console.log('e2e: DB mới đã sẵn sàng')
