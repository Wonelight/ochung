import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { Db } from './index'
import * as schema from './schema'

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** DB PGlite trong bộ nhớ, mới hoàn toàn, đã áp mọi migration trong `drizzle/`. Gọi mỗi file test một lần. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}
