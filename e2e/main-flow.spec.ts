import { expect, test } from '@playwright/test'
import { ADMIN, BASE_URL, adminCreateUser, changeTempPassword, dismissFaceIdPrompt, expectNoHorizontalScroll, login, newUser } from './helpers'

// Luồng chính (điện thoại 390×844): quản trị viên tạo 2 tài khoản → chủ nhà đổi mật khẩu tạm, tạo nhà + khoản cố định
// → thành viên mở link mời ngay từ lần đăng nhập đầu (đổi mật khẩu tạm xong vào thẳng nhà) → chủ nhà nhập điện/nước + chi lẻ rồi chốt sổ → thành viên thấy đúng số cần chuyển và báo
// "Tôi đã chuyển" → chủ nhà xác nhận → thành viên thấy "Đã trả".
//
// Số liệu: Tiền nhà 6.000.000 + Internet 200.000 (chia đều) + điện 700.000 + nước 100.000 + chi lẻ 120.000 (chủ nhà trả)
// = 7.120.000, chia đôi = 3.560.000 mỗi người. Chủ nhà đã ứng 120.000 nên phần phải nộp của chủ nhà là 3.440.000,
// còn thành viên chuyển nguyên phần của mình 3.560.000.
const OWNER = { username: 'linh', name: 'Linh', password: 'matkhau-rieng-1', temp: '' }
const MEMBER = { username: 'an', name: 'An', password: 'matkhau-rieng-2', temp: '' }
const MEMBER_DUE = '3.560.000'

test('chủ nhà chốt sổ, thành viên chuyển tiền, chủ nhà xác nhận', async ({ browser }) => {
  const admin = await newUser(browser)
  const owner = await newUser(browser)
  const member = await newUser(browser)

  await test.step('quản trị viên tạo 2 tài khoản', async () => {
    await login(admin.page, ADMIN.username, ADMIN.password)
    await expect(admin.page).not.toHaveURL(/\/login/)
    OWNER.temp = await adminCreateUser(admin.page, OWNER.username, OWNER.name)
    MEMBER.temp = await adminCreateUser(admin.page, MEMBER.username, MEMBER.name)
  })

  await test.step('chủ nhà đăng nhập, bị buộc đổi mật khẩu tạm, tạo nhà', async () => {
    const { page } = owner
    await login(page, OWNER.username, OWNER.temp)
    await changeTempPassword(page, OWNER.temp, OWNER.password)
    await dismissFaceIdPrompt(page)

    await page.goto('/nha/moi')
    await page.getByLabel('Tên nhà').fill('Nhà Cầu Giấy')
    await page.getByRole('button', { name: 'Tạo nhà' }).click()
    await expect(page).toHaveURL(/\/nha$/)
    await expect(page.getByText('Bạn là chủ nhà')).toBeVisible()
  })

  await test.step('chủ nhà cài khoản cố định', async () => {
    const { page } = owner
    for (const [name, amount] of [
      ['Tiền nhà', '6000000'],
      ['Internet', '200000'],
    ] as const) {
      await page.getByRole('button', { name: 'Thêm khoản' }).click()
      const form = page.locator('form').filter({ has: page.getByLabel('Tên khoản') })
      await form.getByLabel('Tên khoản').fill(name)
      await form.getByLabel('Số tiền cả tháng').fill(amount)
      await form.getByRole('button', { name: 'Lưu', exact: true }).click()
      await expect(page.getByRole('button', { name: `Sửa khoản ${name}` })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Sửa khoản Tiền nhà' })).toContainText('6.000.000')
  })

  let inviteUrl = ''
  await test.step('chủ nhà tạo link mời', async () => {
    const { page } = owner
    await page.getByRole('button', { name: 'Chia sẻ link mời' }).click()
    await expect(page.getByText('Đã sao chép link mời')).toBeVisible()
    inviteUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(inviteUrl).toMatch(/\/moi\/[\w-]+$/)
  })

  await test.step('thành viên mở link mời TRƯỚC, đăng nhập, đổi mật khẩu tạm rồi vào thẳng nhà (không tự điều hướng)', async () => {
    const { page } = member
    await page.goto(new URL(inviteUrl).pathname)
    await expect(page).toHaveURL(/\/login\?next=%2Fmoi%2F/)
    await login(page, MEMBER.username, MEMBER.temp, true)
    await expect(page).toHaveURL(/\/doi-mat-khau\?next=%2Fmoi%2F/)
    await changeTempPassword(page, MEMBER.temp, MEMBER.password)

    await expect(page).toHaveURL(`${BASE_URL}/`)
    await dismissFaceIdPrompt(page)
    await expect(page.getByText('Nhà Cầu Giấy')).toBeVisible()
  })

  let month = 0
  await test.step('chủ nhà nhập điện, nước và một khoản chi lẻ', async () => {
    const { page } = owner
    await page.goto('/tao')
    const billTab = page.getByRole('button', { name: /^Hóa đơn tháng \d+$/ })
    await expect(billTab).toBeVisible()
    month = Number((await billTab.innerText()).replace(/\D/g, ''))

    await page.getByLabel('Tổng tiền trên hóa đơn').first().fill('700000') // Điện
    await page.getByLabel('Tổng tiền trên hóa đơn').nth(1).fill('100000') // Nước

    await page.getByRole('button', { name: 'Khoản chi lẻ' }).click()
    await page.getByLabel('Số tiền').fill('120000')
    await page.getByLabel('Nội dung').fill('Nước giặt')
    // ngày chi nằm trong tháng của hóa đơn đang làm
    const now = new Date()
    const year = month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear()
    await page.getByLabel('Ngày chi').fill(`${year}-${String(month).padStart(2, '0')}-15`)
    await page.getByRole('button', { name: 'Thêm khoản chi' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã thêm “Nước giặt”' })).toContainText(`tháng ${month}/${year}`)
  })

  let billsUrl = ''
  await test.step('chủ nhà chốt sổ', async () => {
    const { page } = owner
    await page.getByRole('button', { name: `Hóa đơn tháng ${month}` }).click()
    await expect(page.getByText(`Tổng tháng ${month}`)).toBeVisible()
    await expect(page.getByText('7.120.000 đ').first()).toBeVisible()
    await page.getByRole('button', { name: 'Tạo & gửi hóa đơn' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Tạo & gửi' }).click()
    await expect(page).toHaveURL(/\/hoa-don\?ky=/)
    billsUrl = page.url() // màn Hóa đơn của đúng tháng vừa chốt
  })

  await test.step('thành viên thấy "Bạn cần chuyển" đúng số tiền và báo đã chuyển', async () => {
    const { page } = member
    await page.goto('/')
    await expect(page.getByText(`Bạn cần chuyển ${MEMBER_DUE} đ`)).toBeVisible()
    await expect(page.getByText('Chưa trả').first()).toBeVisible()

    await page.getByRole('button', { name: 'Mã QR' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText(`${MEMBER_DUE} đ`)).toBeVisible()
    await sheet.getByRole('button', { name: 'Tôi đã chuyển' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Chờ xác nhận').first()).toBeVisible()
  })

  await test.step('chủ nhà xác nhận đã nhận tiền', async () => {
    const { page } = owner
    await page.goto(billsUrl)
    await page.getByRole('button', { name: 'Xác nhận' }).click()
    await expect(page.getByRole('button', { name: 'Xác nhận' })).toBeHidden()
  })

  await test.step('thành viên thấy "Đã trả"', async () => {
    const { page } = member
    await page.goto('/')
    await expect(page.getByText('Đã trả').first()).toBeVisible()
    await expect(page.getByText(`Bạn đã trả đủ ${MEMBER_DUE} đ`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mã QR' })).toBeHidden()
  })

  await test.step('responsive: không cuộn ngang ở 360 / 390 / 768 / 1280px', async () => {
    await expectNoHorizontalScroll(owner.page, ['/', '/hoa-don', '/nha', '/cai-dat', '/vao-nha', '/thong-bao', '/tao'])
    await expectNoHorizontalScroll(member.page, ['/', '/hoa-don', '/cai-dat'])
    await expectNoHorizontalScroll(admin.page, ['/admin'])
  })

  await test.step('màn rộng: nội dung nằm trong cột giữa tối đa 560px, thanh Dione ở đáy cột', async () => {
    const { page } = member
    await page.setViewportSize({ width: 1280, height: 844 })
    await page.goto('/cai-dat')
    await page.waitForLoadState('networkidle')
    const column = await page.locator('main').boundingBox()
    expect(column!.width).toBeLessThanOrEqual(560)
    expect(Math.abs(column!.x + column!.width / 2 - 640)).toBeLessThan(2)
    const bar = await page.getByRole('navigation', { name: 'Điều hướng chính' }).boundingBox()
    expect(Math.abs(bar!.x + bar!.width / 2 - 640)).toBeLessThan(2)
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(844)
  })
})
