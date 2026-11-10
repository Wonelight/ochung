import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Mỗi file test DB nạp một PGlite (WASM, vài trăm MB). Quá nhiều worker song song làm một worker chết vì hết bộ nhớ
    // ("Worker exited unexpectedly"), nên chặn ở 4 thay vì số nhân CPU.
    maxWorkers: 4,
  },
})
