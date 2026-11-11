import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from '@neondatabase/serverless'
import { attachDatabasePool } from '@vercel/functions'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import * as schema from './schema'

/**
 * Kiểu DB chung cho mọi hàm server `(db, actor, input)`.
 * `PgDatabase<any, typeof schema>` là lớp cha chung của `NeonDatabase` (production),
 * `PgliteDatabase` (dev cục bộ `pglite:` và test), nên cả hai đều gán được vào `Db`;
 * tham số đầu (query result HKT) khác nhau giữa hai driver nên phải để `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>

// Trong `next dev` mỗi route có thể nạp module này riêng; PGlite chỉ cho một tiến trình mở một thư mục,
// nên giữ singleton trên globalThis để mọi bản nạp dùng chung một kết nối.
const globalForDb = globalThis as unknown as { __chiTieuNhaDb?: Db }

/** Kết nối rảnh quá thời gian này thì đóng (Vercel giữ hàm sống đủ lâu để đóng chúng trước khi tạm dừng). */
const IDLE_TIMEOUT_MS = 5_000

/**
 * Pool Neon (WebSocket) cho production. `pool.on('error')`: một kết nối RẢNH bị server đóng (Neon tự ngủ, mạng chập chờn)
 * phát sự kiện 'error' trên pool; không có trình nghe thì Node ném lỗi đó và cả tiến trình chết. `attachDatabasePool`:
 * báo cho Vercel để hàm chờ đóng xong các kết nối rảnh trước khi bị tạm dừng (ngoài Vercel thì không làm gì).
 */
export function createNeonPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, idleTimeoutMillis: IDLE_TIMEOUT_MS })
  pool.on('error', (e: Error) => console.error('Kết nối database rảnh bị lỗi (pool tự bỏ kết nối đó)', e))
  attachDatabasePool(pool)
  return pool
}

/**
 * Singleton khởi tạo lười: không kết nối khi import (an toàn cho `next build`).
 * - `DATABASE_URL` bắt đầu bằng `pglite:` (vd `pglite:./.data/dev`): PGlite trên thư mục đó,
 *   dùng cho dev cục bộ và e2e khi chưa có tài khoản Neon. Schema áp bằng `npm run db:migrate`.
 * - Còn lại: `Pool` của `@neondatabase/serverless` + `drizzle-orm/neon-serverless`.
 */
export function getDb(): Db {
  const existing = globalForDb.__chiTieuNhaDb
  if (existing) return existing
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu biến môi trường DATABASE_URL')
  let created: Db
  if (url.startsWith('pglite:')) {
    const dir = url.slice('pglite:'.length)
    mkdirSync(path.dirname(dir), { recursive: true }) // PGlite chỉ tạo thư mục cuối, không tạo thư mục cha
    created = drizzlePglite(new PGlite(dir), { schema })
  } else {
    created = drizzleNeon(createNeonPool(url), { schema })
  }
  globalForDb.__chiTieuNhaDb = created
  return created
}

/** Truy cập tiện lợi `db.select()...`; kết nối chỉ được tạo ở lần dùng đầu tiên. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value = Reflect.get(real, prop, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})
