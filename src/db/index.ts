import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from '@neondatabase/serverless'
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

let instance: Db | undefined

/**
 * Singleton khởi tạo lười: không kết nối khi import (an toàn cho `next build`).
 * - `DATABASE_URL` bắt đầu bằng `pglite:` (vd `pglite:./.data/dev`): PGlite trên thư mục đó,
 *   dùng cho dev cục bộ và e2e khi chưa có tài khoản Neon. Schema áp bằng `npm run db:migrate`.
 * - Còn lại: `Pool` của `@neondatabase/serverless` + `drizzle-orm/neon-serverless`.
 */
export function getDb(): Db {
  if (instance) return instance
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu biến môi trường DATABASE_URL')
  if (url.startsWith('pglite:')) {
    const dir = url.slice('pglite:'.length)
    mkdirSync(path.dirname(dir), { recursive: true }) // PGlite chỉ tạo thư mục cuối, không tạo thư mục cha
    instance = drizzlePglite(new PGlite(dir), { schema })
  } else {
    instance = drizzleNeon(new Pool({ connectionString: url }), { schema })
  }
  return instance
}

/** Truy cập tiện lợi `db.select()...`; kết nối chỉ được tạo ở lần dùng đầu tiên. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value = Reflect.get(real, prop, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})
