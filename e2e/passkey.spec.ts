import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { ADMIN, adminCreateUser, changeTempPassword, login, newUser } from './helpers'

// Cài đặt + Face ID (passkey) với bộ xác thực ảo của Chromium (WebAuthn qua CDP), trên cùng DB e2e với main-flow.
const USER = { username: 'bao', name: 'Bảo', password: 'matkhau-rieng-3', password2: 'matkhau-rieng-4', temp: '' }

async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

test('hồ sơ, giao diện và Face ID trong Cài đặt; đăng nhập bằng Face ID vẫn buộc đổi mật khẩu tạm', async ({ browser }) => {
  test.setTimeout(240_000)
  const admin = await newUser(browser)
  const user = await newUser(browser)
  await addVirtualAuthenticator(user.context, user.page)
  const { page } = user

  await test.step('quản trị viên tạo tài khoản, người dùng đổi mật khẩu tạm', async () => {
    await login(admin.page, ADMIN.username, ADMIN.password)
    USER.temp = await adminCreateUser(admin.page, USER.username, USER.name)
    await login(page, USER.username, USER.temp)
    await changeTempPassword(page, USER.temp, USER.password)
  })

  await test.step('lời mời Face ID hiện một lần: bật bằng passkey ảo, tải lại không hỏi nữa', async () => {
    const dialog = page.getByRole('alertdialog', { name: 'Bật đăng nhập bằng Face ID?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Bật Face ID' }).click()
    await expect(dialog).toBeHidden()
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('alertdialog')).toBeHidden()
  })

  await test.step('Cài đặt: danh sách Face ID có khóa vừa thêm', async () => {
    await page.goto('/cai-dat')
    await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible()
    const faceId = page.getByRole('region', { name: 'Face ID' })
    await expect(faceId.getByText(/Thêm ngày \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    await expect(faceId.getByRole('button', { name: 'Thêm Face ID cho thiết bị này' })).toBeVisible()
  })

  await test.step('sửa hồ sơ: tên, ngày sinh, "Tạo hình mới"', async () => {
    await page.getByLabel('Tên hiển thị').fill('Bảo Nguyễn')
    await page.getByLabel('Ngày sinh').fill('1998-05-20')
    await page.getByRole('button', { name: 'Tạo hình mới' }).click()
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(page.getByRole('button', { name: 'Đã lưu' })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Tên hiển thị')).toHaveValue('Bảo Nguyễn')
    await expect(page.getByLabel('Ngày sinh')).toHaveValue('1998-05-20')
    await expect(page.getByRole('img', { name: 'Ảnh đại diện tự sinh của Bảo Nguyễn#1' })).toBeVisible()
  })

  await test.step('ngày sinh ở tương lai bị từ chối', async () => {
    await page.getByLabel('Ngày sinh').evaluate((el: HTMLInputElement) => {
      el.removeAttribute('max') // bỏ chặn của trình duyệt để thử luồng kiểm tra ở máy chủ
    })
    await page.getByLabel('Ngày sinh').fill('2999-01-01')
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Ngày sinh không hợp lệ' })).toBeVisible()
  })

  await test.step('giao diện Sáng / Tối / Tự động ghi nhớ bằng cookie theme', async () => {
    const html = page.locator('html')
    await page.getByRole('radio', { name: 'Sáng' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.getByRole('radio', { name: 'Tối' }).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('radio', { name: 'Tự động' }).click()
    await expect(html).not.toHaveAttribute('data-theme', /.+/)
    await page.reload()
    await expect(page.getByRole('radio', { name: 'Tự động' })).toHaveAttribute('aria-checked', 'true')
  })

  await test.step('đăng xuất rồi đăng nhập bằng nút Face ID', async () => {
    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.getByRole('button', { name: 'Đăng nhập bằng Face ID' }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page).not.toHaveURL(/\/doi-mat-khau/)
  })

  await test.step('quản trị viên đặt lại mật khẩu: đăng nhập bằng Face ID vẫn bị buộc đổi mật khẩu', async () => {
    await admin.page.goto('/admin')
    page.once('dialog', (d) => void d.accept())
    admin.page.once('dialog', (d) => void d.accept())
    const row = admin.page.locator('li').filter({ hasText: USER.username })
    // màn rộng dùng bảng, điện thoại dùng thẻ: nút "Đặt lại mật khẩu" của hàng đang hiện
    await row.getByRole('button', { name: 'Đặt lại mật khẩu' }).click()
    const notice = admin.page.getByRole('status').filter({ hasText: `Mật khẩu tạm mới của ${USER.username}` })
    await expect(notice).toBeVisible()
    const temp = (await notice.locator('p.font-numeric').innerText()).trim()

    await user.context.clearCookies() // phiên cũ đã bị thu hồi
    await page.goto('/login')
    await page.getByRole('button', { name: 'Đăng nhập bằng Face ID' }).click()
    await expect(page).toHaveURL(/\/doi-mat-khau$/)
    await changeTempPassword(page, temp, USER.password2)
  })

  await test.step('xóa Face ID: nút Face ID ở màn đăng nhập hết đăng nhập được', async () => {
    await page.goto('/cai-dat')
    const faceId = page.getByRole('region', { name: 'Face ID' })
    await faceId.getByRole('button', { name: 'Xóa' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xóa', exact: true }).click()
    await expect(faceId.getByText(/Thêm ngày/)).toBeHidden()
    await expect(faceId.getByRole('button', { name: 'Bật Face ID' })).toBeVisible()

    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.getByRole('button', { name: 'Đăng nhập bằng Face ID' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Không đăng nhập được bằng Face ID' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  await test.step('đổi mật khẩu từ Cài đặt (không bắt buộc)', async () => {
    await login(page, USER.username, USER.password2)
    await page.goto('/cai-dat')
    await page.getByRole('link', { name: 'Đổi mật khẩu' }).click()
    await expect(page).toHaveURL(/\/doi-mat-khau$/)
    await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(USER.password2)
    await page.getByLabel('Mật khẩu mới (ít nhất 8 ký tự)').fill(USER.password)
    await page.getByLabel('Nhập lại mật khẩu mới').fill(USER.password)
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click()
    await expect(page).toHaveURL(/\/cai-dat$/)
  })
})
