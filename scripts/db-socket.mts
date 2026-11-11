// Mở database dev PGlite ra cổng Postgres để DBeaver/psql kết nối. Chạy: npm run db:socket
// PGlite chỉ cho MỘT tiến trình mở thư mục dữ liệu, nên phải tắt `npm run dev` trước khi chạy lệnh này.
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const dir = (process.env.DATABASE_URL ?? 'pglite:./.data/dev').replace(/^pglite:/, '')
const port = Number(process.env.DB_SOCKET_PORT ?? 54329)

const db = await PGlite.create(dir)
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
await server.start()
console.log(`PGlite (${dir}) đang lắng nghe tại postgres://postgres:postgres@127.0.0.1:${port}/postgres`)
console.log('Nhấn Ctrl+C để dừng.')

const stop = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
