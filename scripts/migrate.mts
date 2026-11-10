// Áp migration trong drizzle/ lên DATABASE_URL (Neon hoặc `pglite:<thư mục>`). Chạy: npm run db:migrate
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Thiếu biến môi trường DATABASE_URL')

if (url.startsWith('pglite:')) {
  const dir = url.slice('pglite:'.length)
  mkdirSync(path.dirname(dir), { recursive: true })
  const client = new PGlite(dir)
  await migratePglite(drizzlePglite(client), { migrationsFolder: 'drizzle' })
  await client.close()
} else {
  const pool = new Pool({ connectionString: url })
  await migrateNeon(drizzleNeon(pool), { migrationsFolder: 'drizzle' })
  await pool.end()
}
console.log('Đã áp migration.')
