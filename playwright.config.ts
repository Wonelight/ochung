import { defineConfig, devices } from '@playwright/test'

// E2E chạy `next dev` thật trên DB pglite riêng (.data/e2e, xóa và dựng lại mỗi lần chạy), cổng 3100.
// BETTER_AUTH_URL phải khớp origin của trình duyệt: rpID/origin của passkey lấy từ đó.
// Cấu hình mặc định: không VAPID, không Vercel Blob.
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: `npx tsx e2e/prepare-db.mts && npx next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: 'pglite:./.data/e2e',
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123456789',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
      BLOB_READ_WRITE_TOKEN: '',
    },
  },
})
