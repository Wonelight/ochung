import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test chạm DB nạp một PGlite (WASM, vài trăm MB) cho mỗi file. Nhiều worker như vậy chạy song song làm một worker chết
// vì hết bộ nhớ ("Worker exited unexpectedly"). Nên tách hai project: test thuần chạy song song thoải mái,
// test DB (src/server, src/db, src/lib/auth.test.ts) chỉ chạy tối đa 2 worker một lúc.
const DB_TESTS = ['src/server/**/*.test.{ts,tsx}', 'src/db/**/*.test.ts', 'src/lib/auth.test.ts']

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.{ts,tsx}'], exclude: DB_TESTS, maxWorkers: 4, sequence: { groupOrder: 1 } },
      },
      {
        extends: true,
        test: { name: 'db', environment: 'node', include: DB_TESTS, maxWorkers: 2, sequence: { groupOrder: 2 } },
      },
    ],
  },
})
