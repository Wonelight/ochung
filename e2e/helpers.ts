import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

export const BASE_URL = 'http://localhost:3100'
export const ADMIN = { username: 'admin', password: process.env.E2E_ADMIN_PASSWORD ?? 'quan-tri-e2e-1' }

/** Một "người dùng" = một context riêng (cookie, localStorage riêng) để nhiều người đăng nhập cùng lúc. */
export async function newUser(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  return { context, page: await context.newPage() }
}

/** `fromCurrentPage`: đang ở màn đăng nhập sẵn (vd /login?next=…) thì không mở lại /login để giữ tham số next. */
export async function login(page: Page, username: string, password: string, fromCurrentPage = false) {
  if (!fromCurrentPage) await page.goto('/login')
  await page.getByLabel('Tên đăng nhập').fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/) // chờ đăng nhập xong (cookie phiên đã có) trước khi làm gì tiếp
}

/** Lời mời "Bật đăng nhập bằng Face ID?" hiện lên trên thiết bị có WebAuthn: chọn "Để sau" nếu nó xuất hiện. */
export async function dismissFaceIdPrompt(page: Page) {
  const dialog = page.getByRole('alertdialog', { name: 'Bật đăng nhập bằng Face ID?' })
  try {
    await dialog.waitFor({ state: 'visible', timeout: 8_000 })
    await dialog.getByRole('button', { name: 'Để sau' }).click()
    await expect(dialog).toBeHidden()
  } catch {
    // không hiện (đã từ chối trước đó): không sao
  }
}

/** Màn đổi mật khẩu bắt buộc ở lần đăng nhập đầu (có thể kèm `?next=` khi đang mở link mời). */
export async function changeTempPassword(page: Page, tempPassword: string, newPassword: string) {
  await expect(page).toHaveURL(/\/doi-mat-khau(\?|$)/)
  await page.getByLabel('Mật khẩu hiện tại (mật khẩu tạm)').fill(tempPassword)
  await page.getByLabel('Mật khẩu mới (ít nhất 8 ký tự)').fill(newPassword)
  await page.getByLabel('Nhập lại mật khẩu mới').fill(newPassword)
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click()
  await expect(page).not.toHaveURL(/\/doi-mat-khau/)
}

/** Quản trị viên tạo tài khoản ở /admin; trả mật khẩu tạm hiện một lần. */
export async function adminCreateUser(page: Page, username: string, displayName: string): Promise<string> {
  await page.goto('/admin')
  await page.getByLabel('Tên đăng nhập').fill(username)
  await page.getByLabel('Tên hiển thị').fill(displayName)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  const notice = page.getByRole('status').filter({ hasText: 'Mật khẩu tạm' })
  await expect(notice).toContainText(`Đã tạo ${username}`)
  const password = (await notice.locator('p.font-numeric').innerText()).trim()
  expect(password).toMatch(/^[A-Za-z0-9]{10}$/)
  return password
}

export const VIEWPORT_WIDTHS = [360, 390, 768, 1280]

/** Mở từng đường dẫn ở các độ rộng 360/390/768/1280 và kiểm tra trang không cuộn ngang. */
export async function expectNoHorizontalScroll(page: Page, paths: string[]) {
  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of paths) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth, `${path} ở ${width}px bị cuộn ngang`).toBeLessThanOrEqual(clientWidth)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
}
