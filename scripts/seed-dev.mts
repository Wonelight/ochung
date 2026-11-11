// Nạp dữ liệu mẫu nhiều trường hợp vào DB dev PGlite. Chạy: npm run db:seed
// Chỉ chạy với DATABASE_URL=pglite:... và DB còn trống (đã `npm run db:migrate`). Muốn nạp lại: xóa thư mục .data/dev rồi migrate.
// Mọi tài khoản dùng mật khẩu SEED_PASSWORD. Tất cả đi qua đúng các hàm server của app nên số liệu luôn hợp lệ.
import { eq } from 'drizzle-orm'
import { getDb } from '../src/db/index'
import { houses, periods, user } from '../src/db/schema'
import { createAuth } from '../src/lib/auth'
import type { Tariff } from '../src/lib/billing/types'
import type { Actor } from '../src/server/actor'
import { addExpense } from '../src/server/expenses'
import { setBankInfo, setDueDay, setMemberQty, setUtilityTariff, upsertChargeItem } from '../src/server/house-settings'
import { addMemberTx, archiveHouse, createHouse, listMembers, removeMember } from '../src/server/houses'
import { createInviteLink, requestJoinByCode } from '../src/server/invites'
import { applyPeriodEdits, closePeriod, getOrCreateDraftPeriod } from '../src/server/periods'
import { confirmPayment, recordCashPayment, recordRefund, rejectPayment, submitTransfer } from '../src/server/payments'

const SEED_PASSWORD = 'Nha@123456'

// Mặc định chỉ nạp vào DB dev PGlite. Nạp vào DB thật (Neon) cần đặt SEED_CONFIRM_REMOTE=yes một cách cố ý; khi đó script
// giữ nguyên tài khoản `admin` đã có và chỉ chạy khi DB chưa có nhà nào.
const url = process.env.DATABASE_URL ?? ''
const remote = !url.startsWith('pglite:')
if (remote && process.env.SEED_CONFIRM_REMOTE !== 'yes') {
  throw new Error('DATABASE_URL không phải pglite:. Nạp dữ liệu mẫu vào DB thật cần đặt SEED_CONFIRM_REMOTE=yes')
}
const db = getDb()
const existingUsers = await db.select({ username: user.username }).from(user)
if (remote) {
  if ((await db.select({ id: houses.id }).from(houses).limit(1)).length > 0) throw new Error('DB thật đã có nhà, không nạp dữ liệu mẫu đè lên')
  if (existingUsers.some((u) => u.username !== 'admin')) throw new Error('DB thật đã có người dùng ngoài `admin`, không nạp dữ liệu mẫu')
} else if (existingUsers.length > 0) {
  throw new Error('DB đã có người dùng. Xóa thư mục .data/dev, chạy lại `npm run db:migrate` rồi nạp lại')
}
const auth = createAuth(db)

// ───────────── Tài khoản ─────────────
let codeNo = existingUsers.length + 1 // `admin` đã có trên DB thật giữ mã U-00001
async function account(username: string, name: string, opts: { role?: 'user' | 'admin'; mustChange?: boolean } = {}): Promise<Actor> {
  const role = opts.role ?? 'user'
  const created = await auth.api.createUser({
    body: {
      email: `${username}@nha.local`,
      password: SEED_PASSWORD,
      name,
      role,
      data: { username, accountCode: `U-${String(codeNo++).padStart(5, '0')}`, mustChangePassword: opts.mustChange ?? false },
    },
  })
  return { userId: created.user.id, role }
}

if (!existingUsers.some((u) => u.username === 'admin')) await account('admin', 'Quản trị', { role: 'admin' })
const linh = await account('linh', 'Linh')
const an = await account('an', 'An')
const binh = await account('binh', 'Bình')
const chi = await account('chi', 'Chi')
const dung = await account('dung', 'Dũng')
const ha = await account('ha', 'Hà')
const ngoc = await account('ngoc', 'Ngọc')
await account('khoa', 'Khoa', { mustChange: true }) // mới được cấp: bị buộc đổi mật khẩu, chưa thuộc nhà nào

// ───────────── Biểu giá ─────────────
const ELECTRICITY: Tariff = {
  tiers: [
    { upTo: 50, price: 1984 },
    { upTo: 100, price: 2050 },
    { upTo: 200, price: 2380 },
    { upTo: 300, price: 2998 },
    { upTo: 400, price: 3350 },
    { upTo: null, price: 3460 },
  ],
  perPerson: false,
  registeredPeople: 1,
  vatPct: 8,
  surcharges: [],
}
// Định mức nước nhân theo số người đăng ký; có VAT lẻ 5% và phụ phí môi trường 10%.
const WATER: Tariff = {
  tiers: [
    { upTo: 4, price: 7000 },
    { upTo: 6, price: 8500 },
    { upTo: null, price: 10000 },
  ],
  perPerson: true,
  registeredPeople: 4,
  vatPct: 5,
  surcharges: [{ name: 'Phí bảo vệ môi trường', pct: 10 }],
}

const ym = (year: number, month: number) => ({ year, month })

/** Số còn phải trả (due) của một người trong tháng đã chốt. */
async function dueOf(periodId: string, memberId: string): Promise<number> {
  const [row] = await db.select({ result: periods.result }).from(periods).where(eq(periods.id, periodId)).limit(1)
  const slip = row?.result?.payslips.find((s) => s.memberId === memberId)
  if (slip?.due === undefined || slip.due === null) throw new Error(`Không có phiếu của ${memberId}`)
  return slip.due
}

// ═════════════ NHÀ A: Nhà Cầu Giấy (chủ nhà Linh, 5 người, 3 tháng đã chốt + 1 tháng nháp) ═════════════
const A = await createHouse(db, linh, { name: 'Nhà Cầu Giấy' })
for (const u of [an, binh, chi, dung]) await db.transaction((tx) => addMemberTx(tx, A.houseId, u.userId))
const aMembers = await listMembers(db, linh, A.houseId)
const memberOf = (u: Actor) => {
  const m = aMembers.find((x) => x.userId === u.userId)
  if (!m) throw new Error('Thiếu thành viên')
  return m.id
}
const [mLinh, mAn, mBinh, mChi, mDung] = [linh, an, binh, chi, dung].map(memberOf)

await upsertChargeItem(db, linh, A.houseId, { name: 'Tiền nhà', kind: 'equal', amount: 8_000_000, active: true })
await upsertChargeItem(db, linh, A.houseId, { name: 'Phí dịch vụ chung cư', kind: 'equal', amount: 600_000, active: true })
const bike = await upsertChargeItem(db, linh, A.houseId, { name: 'Tiền xe', kind: 'per_unit', amount: 100_000, active: true })
for (const [m, q] of [[mLinh, 1], [mAn, 1], [mBinh, 2], [mChi, 0], [mDung, 1]] as const) await setMemberQty(db, linh, m, bike, q)
await setUtilityTariff(db, linh, A.houseId, 'electricity', { mode: 'tiered', tariff: ELECTRICITY })
await setUtilityTariff(db, linh, A.houseId, 'water', { mode: 'tiered', tariff: WATER })
await setBankInfo(db, linh, A.houseId, { bankBin: '970436', accountNo: '0011004567890', accountName: 'NGUYEN THI LINH' })
await setDueDay(db, linh, A.houseId, 10)

// Tháng 8: mọi người ở đủ tháng, có một chi lẻ, mọi người đã đóng đủ (chuyển khoản + tiền mặt).
const aug = (await getOrCreateDraftPeriod(db, linh, A.houseId, ym(2026, 8))).periodId
await applyPeriodEdits(db, linh, aug, { utilities: { electricity: { prev: 1000, curr: 1180 }, water: { prev: 100, curr: 118 } } })
await addExpense(db, linh, A.houseId, { description: 'Mua nước lọc cho cả nhà', amount: 150_000, spentOn: '2026-08-12', paidByMemberId: mAn, ym: ym(2026, 8) })
await closePeriod(db, linh, aug)
for (const u of [an, binh, chi]) await confirmPayment(db, linh, (await submitTransfer(db, u, aug, {})).paymentId)
await recordCashPayment(db, linh, aug, mDung, await dueOf(aug, mDung))

// Tháng 9: Chi chỉ ở 15 ngày (điện nước tính theo ngày). Chi mới đóng một nửa bằng tiền mặt, Dũng chưa đóng gì.
const sep = (await getOrCreateDraftPeriod(db, linh, A.houseId, ym(2026, 9))).periodId
await applyPeriodEdits(db, linh, sep, {
  utilities: { electricity: { prev: 1180, curr: 1395 }, water: { prev: 118, curr: 131 } },
  members: [{ memberId: mChi, days: 15 }],
})
await addExpense(db, linh, A.houseId, { description: 'Sửa bình nóng lạnh', amount: 650_000, spentOn: '2026-09-18', paidByMemberId: mBinh, ym: ym(2026, 9) })
await addExpense(db, linh, A.houseId, { description: 'Đồ vệ sinh chung', amount: 220_000, spentOn: '2026-09-03', paidByMemberId: mLinh, ym: ym(2026, 9) })
await closePeriod(db, linh, sep)
for (const u of [an, binh]) await confirmPayment(db, linh, (await submitTransfer(db, u, sep, {})).paymentId)
await recordCashPayment(db, linh, sep, mChi, Math.floor((await dueOf(sep, mChi)) / 2))

// Tháng 10: Chi vắng 11 ngày; Dũng "không tính tháng này" nhưng đã ứng tiền mua máy lọc nước (chủ nhà nợ lại Dũng).
// An đã đóng, Bình báo chuyển đang chờ xác nhận, Chi bị từ chối rồi báo lại, chủ nhà mới trả lại Dũng một phần.
const oct = (await getOrCreateDraftPeriod(db, linh, A.houseId, ym(2026, 10))).periodId
await applyPeriodEdits(db, linh, oct, {
  utilities: { electricity: { prev: 1395, curr: 1590 }, water: { prev: 131, curr: 149 } },
  members: [{ memberId: mChi, days: 20 }, { memberId: mDung, included: false }],
})
await addExpense(db, linh, A.houseId, { description: 'Máy lọc nước (Dũng ứng)', amount: 1_200_000, spentOn: '2026-10-07', paidByMemberId: mDung, ym: ym(2026, 10) })
await addExpense(db, linh, A.houseId, { description: 'Thay bóng đèn hành lang', amount: 85_000, spentOn: '2026-10-21', paidByMemberId: mAn, ym: ym(2026, 10) })
await closePeriod(db, linh, oct)
await confirmPayment(db, linh, (await submitTransfer(db, an, oct, {})).paymentId)
await submitTransfer(db, binh, oct, {}) // đang chờ chủ nhà xác nhận
await rejectPayment(db, linh, (await submitTransfer(db, chi, oct, {})).paymentId, 'Chưa thấy tiền về tài khoản, bạn kiểm tra lại nhé')
await submitTransfer(db, chi, oct, {}) // báo lại sau khi bị từ chối: lại chờ duyệt
await recordRefund(db, linh, oct, mDung, 500_000)

// Dũng chuyển đi sau tháng 10: vẫn xem được lịch sử và còn được trả lại phần ứng.
await removeMember(db, linh, A.houseId, mDung)

// Tháng 11 (nháp, đang nhập dở): mới có số điện, chưa có số nước, một chi lẻ, tắt khoản phí dịch vụ.
const nov = (await getOrCreateDraftPeriod(db, linh, A.houseId, ym(2026, 11))).periodId
await applyPeriodEdits(db, linh, nov, { utilities: { electricity: { prev: 1590, curr: 1642 } } })
await addExpense(db, linh, A.houseId, { description: 'Mua bột giặt', amount: 130_000, spentOn: '2026-11-05', paidByMemberId: mAn, ym: ym(2026, 11) })

// Lời mời: một link đang hiệu lực + Hà xin vào bằng mã nhà (chờ duyệt).
await createInviteLink(db, linh, A.houseId)
await requestJoinByCode(db, ha, A.code)

// ═════════════ NHÀ B: Phòng trọ Quận 7 (chủ nhà An, Bình ở chung, điện nước nhập thẳng tổng) ═════════════
const B = await createHouse(db, an, { name: 'Phòng trọ Quận 7' })
await db.transaction((tx) => addMemberTx(tx, B.houseId, binh.userId))
const bMembers = await listMembers(db, an, B.houseId)
const bBinh = bMembers.find((m) => m.userId === binh.userId)!.id
await upsertChargeItem(db, an, B.houseId, { name: 'Tiền phòng', kind: 'equal', amount: 4_500_000, active: true })
await setUtilityTariff(db, an, B.houseId, 'electricity', { mode: 'total', tariff: null })
await setUtilityTariff(db, an, B.houseId, 'water', { mode: 'total', tariff: null })
await setBankInfo(db, an, B.houseId, { bankBin: '970407', accountNo: '19031234567012', accountName: 'NGUYEN VAN AN' })
const bSep = (await getOrCreateDraftPeriod(db, an, B.houseId, ym(2026, 9))).periodId
await applyPeriodEdits(db, an, bSep, { utilities: { electricity: { total: 540_000 }, water: { total: 120_000 } } })
await closePeriod(db, an, bSep)
await recordCashPayment(db, an, bSep, bBinh, await dueOf(bSep, bBinh))
const bOct = (await getOrCreateDraftPeriod(db, an, B.houseId, ym(2026, 10))).periodId
await applyPeriodEdits(db, an, bOct, { utilities: { electricity: { total: 620_000 }, water: { total: 140_000 } } })
await closePeriod(db, an, bOct)
await recordCashPayment(db, an, bOct, bBinh, 1_000_000) // Bình mới đóng một phần
await createInviteLink(db, an, B.houseId)
await requestJoinByCode(db, ngoc, B.code)

// ═════════════ NHÀ C: nhà cũ đã lưu trữ (chủ nhà Linh, chỉ xem) ═════════════
const C = await createHouse(db, linh, { name: 'Nhà cũ Thủ Đức' })
await db.transaction((tx) => addMemberTx(tx, C.houseId, chi.userId))
const cMembers = await listMembers(db, linh, C.houseId)
await upsertChargeItem(db, linh, C.houseId, { name: 'Tiền nhà', kind: 'equal', amount: 3_000_000, active: true })
await setUtilityTariff(db, linh, C.houseId, 'electricity', { mode: 'total', tariff: null })
await setUtilityTariff(db, linh, C.houseId, 'water', { mode: 'total', tariff: null })
const cJul = (await getOrCreateDraftPeriod(db, linh, C.houseId, ym(2026, 7))).periodId
await applyPeriodEdits(db, linh, cJul, { utilities: { electricity: { total: 300_000 }, water: { total: 90_000 } } })
await closePeriod(db, linh, cJul)
await recordCashPayment(db, linh, cJul, cMembers.find((m) => m.userId === chi.userId)!.id, await dueOf(cJul, cMembers.find((m) => m.userId === chi.userId)!.id))
await archiveHouse(db, linh, C.houseId)

console.log(`Đã nạp dữ liệu mẫu. Mật khẩu mọi tài khoản: ${SEED_PASSWORD}`)
console.log(`Nhà A mã ${A.code}, nhà B mã ${B.code}, nhà C (lưu trữ) mã ${C.code}`)
process.exit(0)
