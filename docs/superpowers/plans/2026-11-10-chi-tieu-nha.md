# Chi tiêu nhà: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây PWA quản lý và chia chi phí trong nhà ở chung. Chủ nhà nhập số liệu, app tính phiếu thanh toán chính xác đến từng đồng cho từng người và theo dõi công khai ai đã đóng.

**Architecture:** Next.js App Router chạy trên Vercel, dữ liệu ở Neon Postgres qua Drizzle. Toàn bộ logic tính tiền nằm trong một module thuần `src/lib/billing/` (không đụng DB/UI, test kỹ nhất). Nghiệp vụ nằm ở `src/server/*`: các hàm `(db, actor, input)` test được bằng PGlite chạy trong bộ nhớ. Server Actions và trang chỉ là lớp vỏ mỏng gọi vào đó.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS v4, Drizzle ORM + Neon qua driver **`drizzle-orm/neon-serverless`** (`Pool`, WebSocket; bắt buộc vì `neon-http` không hỗ trợ transaction tương tác), PGlite cho test, Better Auth v1.7 (`username`, `admin` từ `better-auth/plugins`; passkey từ gói riêng `@better-auth/passkey`), Vitest, Playwright, `web-push`, Vercel Blob.

**Spec:** `docs/superpowers/specs/2026-11-10-chi-tieu-nha-design.md` (đọc kèm). Mockup chuẩn: `Chi tiêu nhà — iOS web-app.html`.

## Global Constraints

- Hosting Vercel Hobby, DB Neon Free; không dùng dịch vụ trả phí.
- Tiền là **số nguyên đồng** (`number` trong TS, `bigint` mode `number` trong DB). Không có float ở bất kỳ phép tính tiền nào ngoài bước chia có kiểm soát trong `allocate`.
- **Không làm tròn**: chính xác đến từng đồng; đồng dư khi chia dùng phương pháp dư lớn nhất, hòa thì theo thứ tự thành viên (`sortOrder` tăng dần). Tổng các phiếu luôn bằng tổng chi.
- Giao diện tiếng Việt; định dạng tiền `2.600.000` + hậu tố `đ`; múi giờ `Asia/Ho_Chi_Minh`.
- Giao diện theo mockup: font Be Vietnam Pro (400/500/600/700) + Lexend Exa (500/600/700) cho số lớn; accent `#E8833A`; token màu sáng/tối lấy nguyên từ hàm `tokens()` trong mockup; thanh dưới Dione: Trang chủ / + / Cài đặt; vùng bấm ≥ 44px; khung thiết kế 390×844.
- Thành viên chỉ xem; mọi hàm ghi trong `src/server/*` phải kiểm quyền phía server (không tin UI).
- Web push chỉ cho: chốt sổ, cập nhật sau chốt, chủ nhà tự gửi/nhắc. Sự kiện khác chỉ vào chuông trong app.
- Commit message không chứa bất kỳ dòng ghi công AI nào (`Co-Authored-By` AI, "Generated with…").
- Gói cài bằng `npm`.

## Review Focus

1. **Σ ngày ở = 0** (mọi người được tính đều có 0 ngày): chia điện nước đều theo đầu người thay vì chia cho 0. Test thêm ở Task 4.
2. **Chỉ số mới < chỉ số cũ** (gõ nhầm, thay công tơ): báo lỗi rõ "Chỉ số mới phải ≥ chỉ số cũ", không ra tiền âm. Test thêm ở Task 3 và Task 11.
3. **Bấm "Tôi đã chuyển" hoặc "Xác nhận" hai lần** (mạng chậm, bấm đúp): chỉ có một bản ghi, không cộng đôi. Test thêm ở Task 13.
4. **Thành viên rời hoặc bị xóa sau khi tháng đã chốt**: vẫn hiện đủ trong phiếu và trạng thái tháng đó. Test thêm ở Task 11.
5. **Thành viên gọi thẳng server action của chủ nhà** (không qua UI): bị từ chối `FORBIDDEN`. Test thêm ở Task 8 và Task 11.

---

## Cấu trúc file

```
src/
  lib/
    money.ts                 formatVnd, parseVnd
    errors.ts                AppError
    billing/
      types.ts               kiểu dữ liệu đầu vào/đầu ra
      allocate.ts            chia nguyên, dư lớn nhất
      tariff.ts              usageFromReadings, calcTieredAmount
      compute.ts             computePeriod
      status.ts              paymentStatus
      period-month.ts        resolveExpenseMonth, consumption month helpers
      *.test.ts
    vietqr.ts                buildVietQrPayload
    auth.ts / auth-client.ts Better Auth
  db/
    schema.ts                bảng app + bảng Better Auth
    index.ts                 db Neon
    test-db.ts               createTestDb (PGlite)
  server/
    actor.ts                 Actor, getActor()
    houses.ts invites.ts house-settings.ts periods.ts expenses.ts payments.ts notifications.ts push.ts admin.ts
    *.test.ts
  app/
    (auth)/login, (auth)/doi-mat-khau
    (app)/page.tsx (trang chủ), (app)/phieu/[periodId], (app)/hoa-don, (app)/tao,
    (app)/nha, (app)/nha/moi, (app)/vao-nha, (app)/cai-dat, (app)/thong-bao
    admin/
    moi/[token]              trang nhận link mời
    api/auth/[...all]
  components/                DioneBar, Avatar, Money, StatusPill, Sheet, ...
  styles/tokens.css
public/manifest.webmanifest, sw.js, icons/
scripts/extract-mockup.mjs
e2e/*.spec.ts
```

Quy ước chung cho `src/server/*`:
- `type Actor = { userId: string; role: 'admin' | 'user' }`
- `type Db = PgDatabase<...>` (kiểu chung cho Neon và PGlite, export từ `src/db/index.ts`)
- Lỗi: `class AppError extends Error { constructor(public code: 'FORBIDDEN'|'NOT_FOUND'|'INVALID'|'CONFLICT', public reason: string, message: string) }` (`message` là câu tiếng Việt hiển thị cho người dùng).

---

### Task 1: Khung dự án, theme, tách mockup

**Files:**
- Create: toàn bộ khung `create-next-app`, `src/lib/money.ts`, `src/lib/money.test.ts`, `src/styles/tokens.css`, `src/app/layout.tsx`, `vitest.config.ts`, `scripts/extract-mockup.mjs`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces: `formatVnd(amount: number): string`, `parseVnd(input: string): number | null`; CSS variables `--c-bg, --c-surface, --c-card, --c-inner, --c-raised, --c-line, --c-line2, --c-track, --c-text, --c-muted, --c-faint, --c-disabled, --c-accent-text, --c-paid-bg, --c-paid-fg, --c-pend-bg, --c-pend-fg, --c-unpaid-bg, --c-unpaid-fg, --c-elec-bg/fg, --c-water-bg/fg, --c-net-bg/fg, --c-trash-bg/fg, --c-rent-bg/fg` cho cả 2 theme; font CSS vars `--font-body`, `--font-num`.

- [ ] **Step 1: `git init`, scaffold**

```bash
git init
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
npm i -D vitest @vitejs/plugin-react vite-tsconfig-paths
```
Nếu `create-next-app` từ chối vì thư mục không rỗng, scaffold vào thư mục tạm rồi chuyển file sang. `.gitignore` thêm `.superpowers/`, `.env*.local`, `design/screens/`.

- [ ] **Step 2: Viết test thất bại `src/lib/money.test.ts`**

```ts
expect(formatVnd(2600000)).toBe('2.600.000')
expect(formatVnd(0)).toBe('0')
expect(formatVnd(-171428)).toBe('-171.428')
expect(parseVnd('2.600.000')).toBe(2600000)
expect(parseVnd('2600000đ')).toBe(2600000)
expect(parseVnd('abc')).toBeNull()
expect(parseVnd('1,5')).toBeNull()        // không chấp nhận số lẻ
```

- [ ] **Step 3: `npx vitest run src/lib/money.test.ts`**: Expected FAIL (module chưa có).
- [ ] **Step 4: Cài `formatVnd`/`parseVnd`**: dấu chấm phân cách nghìn, tự viết, không phụ thuộc `Intl` locale của máy.
- [ ] **Step 5: Chạy lại test**: Expected PASS.

- [ ] **Step 6: `scripts/extract-mockup.mjs`**: tách mockup thành file đọc được để các task UI tham chiếu.
Cách giải nén: file gốc có `<script type="__bundler/manifest">` (JSON `{uuid: {mime, compressed, data(base64)}}`, `compressed` = gzip). Mỗi entry `text/html` lại là một bundle con có `__bundler/manifest` và `__bundler/template` (chuỗi JSON). Script ghi `template` của từng bundle con ra `design/screens/<title>.html`, với title lấy từ thẻ `<title>`. Chạy: `node scripts/extract-mockup.mjs "Chi tiêu nhà — iOS web-app.html" design/screens`. Expected: có 18 file, gồm các màn Đăng nhập, Trang chủ, Biểu phí tháng, Hóa đơn, Tạo hóa đơn, Quản lý nhà, Vào nhà, Cài đặt và 2 thành phần DioneBar, Avatar, mỗi màn có bản tối và sáng.

- [ ] **Step 7: Theme + font**: `tokens.css` chép giá trị từ object `D` (dark) và `L` (light) trong `tokens()` của `design/screens/Trang chủ — tháng 11.html`. Mặc định theo `prefers-color-scheme`, ghi đè bằng `<html data-theme="light|dark">` (cookie `theme`). Font qua `next/font/google` (`Be_Vietnam_Pro`, `Lexend_Exa`, subsets `vietnamese`, `latin`). `<html lang="vi">`, viewport `viewport-fit=cover`.
- [ ] **Step 8: Kiểm tra**: `npm run build` thành công; `npm run dev`, mở `/` thấy nền `#0E0B08` (dark).
- [ ] **Step 9: Commit**: `git add -A && git commit -m "chore: scaffold Next.js app, theme tokens, money formatting"`; sau đó `git checkout -b mvp`.

---

### Task 2: Chia tiền nguyên đồng (dư lớn nhất)

**Files:** Create `src/lib/billing/allocate.ts`, `src/lib/billing/allocate.test.ts`

**Interfaces:**
- Produces: `allocate(total: number, weights: number[]): number[]`: kết quả cùng thứ tự với `weights`, tổng bằng đúng `total`. Thứ tự `weights` là thứ tự ưu tiên khi hòa.

- [ ] **Step 1: Test thất bại**

```ts
expect(allocate(1_000_000, [1, 1, 1])).toEqual([333_334, 333_333, 333_333])
expect(allocate(1_260_000, [30, 30, 30, 15])).toEqual([360_000, 360_000, 360_000, 180_000])
expect(allocate(100, [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14])
expect(allocate(10, [1, 2])).toEqual([3, 7])            // 3.33 / 6.67 → phần lẻ .67 lớn hơn được +1
expect(allocate(0, [1, 1])).toEqual([0, 0])
expect(() => allocate(100, [0, 0])).toThrow()          // caller phải tự xử lý Σ=0
expect(() => allocate(100.5, [1])).toThrow()           // total phải là số nguyên
// thuộc tính: với 200 bộ ngẫu nhiên (total 0..10^9, 1..8 weights nguyên 0..31, Σ>0), sum(result) === total và |result_i − total*w_i/Σw| < 1
```

- [ ] **Step 2: Chạy**: FAIL.
- [ ] **Step 3: Cài đặt.** Tính bằng số nguyên để tránh sai số float: `floor_i = Math.floor(total * w_i / W)` (đủ an toàn vì total ≤ 10^12, w ≤ 10^3). Phần dư so sánh qua `(total * w_i) % W`, giá trị lớn hơn được +1; hòa thì index nhỏ hơn được trước.
- [ ] **Step 4: Chạy**: PASS.
- [ ] **Step 5: Commit** `feat(billing): integer allocation with largest remainder`

---

### Task 3: Tính tiền điện nước theo bậc

**Files:** Create `src/lib/billing/types.ts` (phần Tariff), `src/lib/billing/tariff.ts`, `src/lib/billing/tariff.test.ts`

**Interfaces:**
- Produces:
```ts
type Tier = { upTo: number | null; price: number }        // upTo cộng dồn, null = không giới hạn (bậc cuối)
type Tariff = { tiers: Tier[]; perPerson: boolean; registeredPeople: number; vatPct: number; surcharges: { name: string; pct: number }[] }
type TierLine = { from: number; to: number; units: number; price: number; amount: number }
type TariffResult = { usage: number; lines: TierLine[]; base: number; vat: number; surcharges: { name: string; amount: number }[]; total: number }
usageFromReadings(prev: number, curr: number): number      // throw AppError('INVALID','READING_DECREASED','Chỉ số mới phải ≥ chỉ số cũ')
calcTieredAmount(usage: number, tariff: Tariff): TariffResult
```

- [ ] **Step 1: Test thất bại**

```ts
const hanoiWater: Tariff = { tiers: [{upTo:10,price:8500},{upTo:20,price:9900},{upTo:30,price:16000},{upTo:null,price:27000}],
  perPerson:false, registeredPeople:1, vatPct:5, surcharges:[{name:'Phí BVMT',pct:10}] }
const r = calcTieredAmount(18, hanoiWater)
expect(r.base).toBe(164_200); expect(r.vat).toBe(8_210)
expect(r.surcharges).toEqual([{name:'Phí BVMT',amount:16_420}]); expect(r.total).toBe(188_830)
expect(r.lines.map(l=>l.units)).toEqual([10, 8])

const hcmWater: Tariff = { tiers:[{upTo:4,price:6700},{upTo:6,price:12900},{upTo:null,price:14400}],
  perPerson:true, registeredPeople:4, vatPct:0, surcharges:[] }
expect(calcTieredAmount(20, hcmWater).base).toBe(158_800)   // mốc 16, 24
expect(calcTieredAmount(0, hanoiWater).total).toBe(0)
expect(calcTieredAmount(45, hanoiWater).base).toBe(85_000+99_000+160_000+405_000)
expect(usageFromReadings(452, 464)).toBe(12)
expect(() => usageFromReadings(464, 452)).toThrow(/Chỉ số mới phải ≥ chỉ số cũ/)   // Review Focus #2
```

- [ ] **Step 2: Chạy**: FAIL.
- [ ] **Step 3: Cài đặt**: VAT và từng phụ phí đều = `Math.round(base * pct / 100)` (đây là tiền hóa đơn, không phải phép chia giữa người nên được làm tròn tới đồng); `total = base + vat + Σsurcharges`. Khi `perPerson`, mốc `upTo × registeredPeople`.
- [ ] **Step 4: Chạy**: PASS.
- [ ] **Step 5: Commit** `feat(billing): tiered utility pricing`

---

### Task 4: Tính phiếu cả tháng (`computePeriod`)

**Files:** Modify `src/lib/billing/types.ts`; Create `src/lib/billing/compute.ts`, `src/lib/billing/compute.test.ts`

**Interfaces:**
- Consumes: `allocate` (Task 2), `calcTieredAmount`, `usageFromReadings` (Task 3), `formatVnd` (Task 1).
- Produces:
```ts
type PeriodMember = { memberId: string; name: string; isOwner: boolean; included: boolean; days: number; qty: Record<string, number> }  // mảng đã sắp theo sortOrder
type FixedItem = { id: string; name: string; kind: 'equal' | 'per_unit'; amount: number; enabled: boolean }   // equal: tổng tháng; per_unit: đơn giá
type UtilityInput = { mode: 'total'; total: number } | { mode: 'tiered'; prev: number; curr: number; tariff: Tariff }
type ExpenseInput = { id: string; description: string; amount: number; paidByMemberId: string; spentOn: string }
type PeriodInput = { year: number; month: number; daysInMonth: number; members: PeriodMember[]; items: FixedItem[];
                     electricity: UtilityInput | null; water: UtilityInput | null; expenses: ExpenseInput[] }
type PayslipLine = { key: string; group: 'fixed' | 'utility' | 'expense'; label: string; detail: string; amount: number }
type Payslip = { memberId: string; lines: PayslipLine[]; share: number; advanced: number; due: number | null }  // due=null cho chủ nhà
type UtilityResult = { total: number; tariff?: TariffResult; usage?: number }
type PeriodResult = { electricity: UtilityResult | null; water: UtilityResult | null; grandTotal: number; payslips: Payslip[] }
computePeriod(input: PeriodInput): PeriodResult
```

Luật (spec §5.3): chỉ thành viên `included` có phiếu; `equal` → `allocate(amount, 1 mỗi người)`; `per_unit` → `qty[itemId] × amount`, không có dòng nếu qty = 0; điện/nước → `allocate(total, days)`, **nếu Σdays = 0 thì trọng số đều 1**; mỗi khoản phát sinh → `allocate(amount, 1 mỗi người)` thành một dòng riêng; `advanced` = Σ phát sinh do người đó trả; `due = share − advanced` (chủ nhà: `null`). `detail` ví dụ: `"8.000.000 ÷ 4"`, `"1.260.000 ÷ 105 ngày-người × 30"`, `"1 × 120.000"`, `"An trả 200.000 · 20/11"`.

- [ ] **Step 1: Test thất bại: ví dụ chuẩn của spec §5.4**

```ts
// Linh(owner), An, Bình, Chi; Chi 15 ngày; tháng 30 ngày
// items: Tiền nhà equal 8_000_000; Phí dịch vụ equal 600_000; Tiền xe per_unit 120_000 (qty: Linh1, An1, Bình0, Chi1)
// electricity total 1_260_000; water total 315_000; expenses: An 200_000, Linh 120_000
const r = computePeriod(example)
const by = Object.fromEntries(r.payslips.map(p => [p.memberId, p]))
expect(by.linh.share).toBe(2_800_000); expect(by.linh.due).toBeNull()
expect(by.an.share).toBe(2_800_000);   expect(by.an.advanced).toBe(200_000); expect(by.an.due).toBe(2_600_000)
expect(by.binh.due).toBe(2_680_000)
expect(by.chi.due).toBe(2_575_000)
expect(r.grandTotal).toBe(10_855_000)
expect(r.payslips.reduce((s,p)=>s+p.share,0)).toBe(r.grandTotal)
expect(by.chi.lines.find(l=>l.key==='electricity')!.amount).toBe(180_000)
expect(by.binh.lines.some(l=>l.key.startsWith('item:xe'))).toBe(false)
```

- [ ] **Step 2: Test thêm các trường hợp biên**

```ts
// không làm tròn: 3 người, Tiền nhà 1_000_000 → shares chứa 333_334, 333_333, 333_333 (người đầu được +1)
// Σ ngày = 0 (Review Focus #1): 2 người days 0, điện 100_000 → mỗi người 50_000, không throw
// included=false: người đó không có phiếu; M giảm theo
// ứng nhiều hơn phần: An ứng 5_000_000 → by.an.due < 0
// item enabled=false: không xuất hiện trong bất kỳ phiếu nào và không vào grandTotal
// electricity null (chưa nhập): không có dòng điện, không lỗi
// tiered: prev 1238, curr 1398, tariff 1 bậc 3_500 → electricity.total 560_000, usage 160
// bất biến: với mọi input hợp lệ, Σ share === grandTotal
```

- [ ] **Step 3: Chạy**: FAIL.
- [ ] **Step 4: Cài `computePeriod`**.
- [ ] **Step 5: Chạy toàn bộ `src/lib/billing`**: PASS.
- [ ] **Step 6: Commit** `feat(billing): compute monthly payslips`

---

### Task 5: Trạng thái thanh toán và tháng của chi phát sinh

**Files:** Create `src/lib/billing/status.ts`, `src/lib/billing/period-month.ts` + 2 file test

**Interfaces:**
- Produces:
```ts
type PaymentRecord = { direction: 'in' | 'out'; amount: number; status: 'pending' | 'confirmed' | 'rejected' }
type PaymentStatus = { kind: 'paid' | 'pending' | 'unpaid' | 'partial' | 'owner_owes'; balance: number; confirmedIn: number; confirmedOut: number }
paymentStatus(due: number, records: PaymentRecord[]): PaymentStatus
type YM = { year: number; month: number }
consumptionMonthDefault(now: Date): YM                 // tháng trước của now theo giờ VN
dueDateFor(ym: YM, dueDay: number): string             // 'YYYY-MM-DD', ngày dueDay của tháng kế tiếp
daysInMonth(ym: YM): number
resolveExpenseMonth(spentOn: string, periods: { year: number; month: number; status: 'draft' | 'closed' }[]): YM
```

Luật: `balance = due − confirmedIn + confirmedOut`. `balance < 0` → `owner_owes`; `= 0` → `paid`; `> 0` và có `in` pending → `pending`; `> 0` và `confirmedIn > 0` → `partial`; còn lại `unpaid`. `resolveExpenseMonth`: bắt đầu từ tháng của `spentOn`, chừng nào tháng đó đã `closed` thì tiến sang tháng sau.

- [ ] **Step 1: Test thất bại**

```ts
expect(paymentStatus(2_600_000, []).kind).toBe('unpaid')
expect(paymentStatus(2_600_000, [{direction:'in',amount:2_600_000,status:'pending'}]).kind).toBe('pending')
expect(paymentStatus(2_600_000, [{direction:'in',amount:2_600_000,status:'confirmed'}]).kind).toBe('paid')
expect(paymentStatus(2_600_000, [{direction:'in',amount:1_000_000,status:'confirmed'}])).toMatchObject({kind:'partial',balance:1_600_000})
expect(paymentStatus(2_600_000, [{direction:'in',amount:2_600_000,status:'rejected'}]).kind).toBe('unpaid')
expect(paymentStatus(-300_000, [])).toMatchObject({kind:'owner_owes',balance:-300_000})
expect(paymentStatus(-300_000, [{direction:'out',amount:300_000,status:'confirmed'}]).kind).toBe('paid')
expect(paymentStatus(2_000_000, [{direction:'in',amount:2_600_000,status:'confirmed'}]).kind).toBe('owner_owes') // sửa sau chốt giảm tiền

expect(consumptionMonthDefault(new Date('2026-12-02T01:00:00+07:00'))).toEqual({year:2026,month:11})
expect(consumptionMonthDefault(new Date('2027-01-01T00:30:00+07:00'))).toEqual({year:2026,month:12})
expect(dueDateFor({year:2026,month:11}, 10)).toBe('2026-12-10')
expect(dueDateFor({year:2026,month:12}, 10)).toBe('2027-01-10')
expect(daysInMonth({year:2028,month:2})).toBe(29)
expect(resolveExpenseMonth('2026-11-28', [{year:2026,month:11,status:'closed'}])).toEqual({year:2026,month:12})
expect(resolveExpenseMonth('2026-11-28', [{year:2026,month:11,status:'draft'}])).toEqual({year:2026,month:11})
expect(resolveExpenseMonth('2026-10-05', [{year:2026,month:10,status:'closed'},{year:2026,month:11,status:'closed'}])).toEqual({year:2026,month:12})
```

- [ ] **Step 2: Chạy**: FAIL. **Step 3: Cài đặt.** **Step 4: Chạy**: PASS.
- [ ] **Step 5: Commit** `feat(billing): payment status and expense month resolution`

---

### Task 6: Database, schema, Better Auth

**Files:** Create `src/db/schema.ts`, `src/db/index.ts`, `src/db/test-db.ts`, `src/db/test-db.test.ts`, `drizzle.config.ts`, `drizzle/` (migrations), `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/errors.ts`, `src/server/actor.ts`

**Interfaces:**
- Produces: `db` (Neon), `type Db`, `createTestDb(): Promise<Db>` (PGlite + chạy migrations trong `drizzle/`), `auth`, `authClient`, `AppError`, `Actor`, `getActor(): Promise<Actor>` (đọc session; throw `AppError('FORBIDDEN','NO_SESSION',…)`), `newId(): string` (nanoid 21).
- Bảng (tên cột camelCase trong TS, snake_case trong DB):
  - Better Auth: `user` (+ cột thêm `username` unique, `displayUsername`, `role`, `banned`, `accountCode` unique `U-` + 5 số, `mustChangePassword` bool default true, `dob` date null, `avatarVariant` int default 0), `session`, `account`, `verification`, `passkey`. Sinh bằng CLI Better Auth rồi bổ sung cột thêm.
  - `houses`: id, name, code unique (`XX-XXXX`), ownerUserId, dueDay int default 10 (1–28), bankBin, bankAccountNo, bankAccountName (null được), archivedAt null, createdAt.
  - `house_members`: id, houseId, userId, role `'owner'|'member'`, sortOrder int, joinedAt, leftAt null. Unique (houseId, userId) cho dòng đang hoạt động (partial index `left_at is null`).
  - `invite_links`: id, houseId, token unique, expiresAt, revokedAt null, createdBy, createdAt.
  - `join_requests`: id, houseId, userId, status `'pending'|'approved'|'rejected'|'cancelled'`, createdAt, decidedAt. Partial unique (houseId, userId) where pending.
  - `charge_items`: id, houseId, name, kind `'equal'|'per_unit'`, amount bigint, sortOrder, active bool.
  - `member_charge_qty`: memberId, itemId, qty int; PK (memberId, itemId).
  - `utility_tariffs`: houseId, utility `'electricity'|'water'`, mode `'tiered'|'total'`, tariff jsonb (`Tariff`); PK (houseId, utility).
  - `periods`: id, houseId, year, month, status `'draft'|'closed'`, dueDate date, closedAt null, revision int default 0, result jsonb null (`PeriodResult`), updatedAt. Unique (houseId, year, month).
  - `period_members`: periodId, memberId, name, isOwner, included bool, days int, qty jsonb, sortOrder; PK (periodId, memberId).
  - `period_items`: id, periodId, sourceItemId null, name, kind, amount, enabled, sortOrder.
  - `period_utilities`: periodId, utility, mode, prev int null, curr int null, total bigint null, tariff jsonb null; PK (periodId, utility).
  - `expenses`: id, houseId, periodId, description, amount bigint, paidByMemberId, spentOn date, createdBy, createdAt.
  - `payments`: id, periodId, memberId, direction `'in'|'out'`, amount bigint, status `'pending'|'confirmed'|'rejected'`, proofUrl null, rejectReason null, createdBy, createdAt, decidedAt null, decidedBy null. Partial unique (periodId, memberId) where `direction='in' and status='pending'`.
  - `notifications`: id, userId, houseId null, kind, title, body, url, readAt null, createdAt.
  - `push_subscriptions`: id, userId, endpoint unique, p256dh, auth, createdAt.

- [ ] **Step 1: Cài gói**: `npm i drizzle-orm @neondatabase/serverless better-auth @better-auth/passkey nanoid zod` và `npm i -D drizzle-kit @electric-sql/pglite tsx`.
- [ ] **Step 2: Cấu hình Better Auth** (đã đối chiếu tài liệu v1.7.15 qua Context7):
  - `src/lib/auth.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: 'pg' }), emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 }, session: { expiresIn: 60*60*24*90 }, user: { additionalFields: { accountCode, mustChangePassword, dob, avatarVariant } }, plugins: [username(), admin(), passkey({ rpID: <host của BETTER_AUTH_URL>, rpName: 'Chi tiêu nhà' }), nextCookies()] })`. `username`, `admin` import từ `better-auth/plugins`; `passkey` import từ `@better-auth/passkey`.
  - `src/lib/auth-client.ts`: `createAuthClient({ plugins: [usernameClient(), adminClient(), passkeyClient()] })`, `passkeyClient` import từ `@better-auth/passkey/client`.
  - Better Auth bắt buộc có email: dùng email giả `<username>@nha.local`.
  - Sinh bảng auth bằng `npx @better-auth/cli generate` (ra schema Drizzle) rồi gộp vào `src/db/schema.ts`.
  - `src/db/index.ts` dùng `Pool` từ `@neondatabase/serverless` + `drizzle` từ `drizzle-orm/neon-serverless`. Test dùng `drizzle-orm/pglite` + `migrate` từ `drizzle-orm/pglite/migrator`.
- [ ] **Step 3: Test thất bại `src/db/test-db.test.ts`**: `createTestDb()` chạy migrations; insert user + house + member; chèn member trùng (cùng house, cùng user, chưa rời) phải throw do unique; chèn 2 payment `in` pending cho cùng (period, member) phải throw.
- [ ] **Step 4: Viết schema, `drizzle-kit generate`, cài `createTestDb`.**
- [ ] **Step 5: Chạy**: PASS.
- [ ] **Step 6: `.env.example`**: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `BLOB_READ_WRITE_TOKEN`.
- [ ] **Step 7: Commit** `feat(db): schema, migrations, Better Auth setup`

---

### Task 7: Đăng nhập, đổi mật khẩu lần đầu, trang quản trị

**Files:** Create `src/server/admin.ts`, `src/server/admin.test.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/doi-mat-khau/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/middleware.ts`, `src/lib/route-guard.ts`, `src/lib/route-guard.test.ts`

**Interfaces:**
- Consumes: `auth`, `Actor`, `createTestDb`.
- Produces:
```ts
routeGuard(s: { loggedIn: boolean; mustChangePassword: boolean; role: 'admin'|'user' } , path: string): { redirect: string } | null
generateAccountCode(exists: (code: string) => Promise<boolean>): Promise<string>     // 'U-' + 5 chữ số, thử lại khi trùng
adminCreateUser(db, actor, { username: string; displayName: string; tempPassword: string }): Promise<{ userId: string; accountCode: string }>
adminResetPassword(db, actor, userId: string, tempPassword: string): Promise<void>   // đặt lại mustChangePassword=true
adminSetBanned(db, actor, userId: string, banned: boolean): Promise<void>
adminListUsers(db, actor): Promise<{ id; username; displayName; accountCode; banned; role; createdAt }[]>
```

- [ ] **Step 1: Test thất bại**
```ts
// route-guard
expect(routeGuard({loggedIn:false,mustChangePassword:false,role:'user'}, '/')).toEqual({redirect:'/login'})
expect(routeGuard({loggedIn:false,mustChangePassword:false,role:'user'}, '/moi/abc')).toEqual({redirect:'/login?next=%2Fmoi%2Fabc'})
expect(routeGuard({loggedIn:true,mustChangePassword:true,role:'user'}, '/')).toEqual({redirect:'/doi-mat-khau'})
expect(routeGuard({loggedIn:true,mustChangePassword:false,role:'user'}, '/admin')).toEqual({redirect:'/'})
expect(routeGuard({loggedIn:true,mustChangePassword:false,role:'admin'}, '/admin')).toBeNull()
// admin
// adminCreateUser bởi actor role 'user' → AppError FORBIDDEN
// adminCreateUser bởi admin → user có mustChangePassword=true, accountCode khớp /^U-\d{5}$/
// tạo trùng username → AppError CONFLICT 'USERNAME_TAKEN'
// adminResetPassword → mustChangePassword trở lại true
```
- [ ] **Step 2: Chạy**: FAIL.
- [ ] **Step 3: Cài đặt**: gọi API phía server của admin plugin: `auth.api.createUser` (truyền `data: { username, accountCode, mustChangePassword: true }`), `auth.api.setUserPassword`, `auth.api.banUser` / `auth.api.unbanUser`. Kiểm `actor.role === 'admin'` trong hàm của mình trước khi gọi. Đổi mật khẩu lần đầu dùng `authClient.changePassword` rồi đặt `mustChangePassword=false`.
- [ ] **Step 4: Chạy**: PASS.
- [ ] **Step 5: UI**: màn Đăng nhập theo `design/screens/Đăng nhập.html` (bỏ nút Face ID nếu chưa có passkey, Task 15 thêm vào). Màn đổi mật khẩu: mật khẩu mới ≥ 8 ký tự, nhập lại hai lần. Trang `/admin`: bảng danh sách, form tạo, nút đặt lại mật khẩu (hiện mật khẩu tạm một lần), nút khóa/mở; không cần theo style mockup. Admin đầu tiên tạo bằng CLI có sẵn của Better Auth: `npx @better-auth/cli create-admin --email admin@nha.local --name "Quản trị" --data '{"username":"admin","accountCode":"U-00001","mustChangePassword":true}'` (ghi lệnh này vào README).
- [ ] **Step 6: Kiểm tra tay**: tạo admin bằng CLI → đăng nhập → bị chuyển sang đổi mật khẩu → `/admin` tạo user `an` → đăng xuất → đăng nhập `an` → bị buộc đổi mật khẩu → vào `/`.
- [ ] **Step 7: Commit** `feat(auth): login, forced password change, admin user management`

---

### Task 8: Nhà và thành viên

**Files:** Create `src/server/houses.ts`, `src/server/houses.test.ts`, `src/app/(app)/nha/moi/page.tsx`, `src/app/(app)/nha/page.tsx` (phần thông tin nhà và danh sách thành viên), `src/app/(app)/nha/actions.ts`, `src/components/HouseSwitcher.tsx`, `src/components/Avatar.tsx`, `src/components/DioneBar.tsx`, `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces:
```ts
type Member = { id: string; houseId: string; userId: string; role: 'owner'|'member'; sortOrder: number; displayName: string; leftAt: Date | null }
createHouse(db, actor, { name: string }): Promise<{ houseId: string; code: string }>       // tạo luôn member owner sortOrder 0, bảng giá mặc định mode 'total' cho cả điện và nước
updateHouse(db, actor, houseId, patch: { name?: string; dueDay?: number; bankBin?: string|null; bankAccountNo?: string|null; bankAccountName?: string|null }): Promise<void>
archiveHouse(db, actor, houseId, opts?: { force?: boolean }): Promise<void>
listMyHouses(db, actor): Promise<{ houseId; name; role; archived: boolean }[]>
listMembers(db, actor, houseId): Promise<Member[]>             // đang hoạt động, theo sortOrder
requireMember(db, actor, houseId): Promise<Member>              // FORBIDDEN nếu không phải
requireOwner(db, actor, houseId): Promise<Member>               // FORBIDDEN nếu không phải chủ hoặc nhà đã lưu trữ
addMemberTx(tx, houseId, userId): Promise<Member>               // sortOrder = max+1; dùng chung cho Task 9
removeMember(db, actor, houseId, memberId): Promise<void>       // đặt leftAt
leaveHouse(db, actor, houseId): Promise<void>                   // chủ nhà không được rời
generateHouseCode(exists): Promise<string>                      // 2 chữ cái + '-' + 4 ký tự [A-Z2-9] không gồm 0,O,1,I
```
- `<Avatar seed size>`: port thuật toán từ `design/screens/Thành phần · Avatar tự sinh.html` (hàm `hash` và bảng màu P). `<DioneBar active>`: port từ `design/screens/Thanh điều hướng Dione — hố đen.html`; nút "+" chỉ hiện với chủ nhà.

- [ ] **Step 1: Test thất bại**
```ts
// createHouse → listMyHouses của người tạo có role 'owner'; code khớp /^[A-Z]{2}-[A-HJ-NP-Z2-9]{4}$/
// updateHouse bởi member → FORBIDDEN (Review Focus #5); dueDay 29 → INVALID
// archiveHouse → listMyHouses trả archived:true; requireOwner sau đó → FORBIDDEN; requireMember vẫn được (xem lịch sử)
// removeMember → listMembers không còn người đó, dòng house_members vẫn còn với leftAt
// leaveHouse bởi owner → CONFLICT 'OWNER_CANNOT_LEAVE'
// người ngoài gọi listMembers → FORBIDDEN
```
- [ ] **Step 2: FAIL → Step 3: cài đặt → Step 4: PASS.**
- [ ] **Step 5: UI**: layout `(app)` có DioneBar và HouseSwitcher (lưu nhà đang chọn trong cookie `house`). Chưa có nhà nào thì chuyển sang `/vao-nha`. Màn tạo nhà, phần đầu và danh sách thành viên của màn Quản lý nhà theo `design/screens/Quản lý nhà.html`.
- [ ] **Step 6: Commit** `feat(houses): create, edit, archive houses and members`

---

### Task 9: Ba cách vào nhà

**Files:** Create `src/server/invites.ts`, `src/server/invites.test.ts`, `src/app/moi/[token]/page.tsx`, `src/app/(app)/vao-nha/page.tsx`, `src/app/(app)/vao-nha/actions.ts`; Modify `src/app/(app)/nha/page.tsx` (link mời, chờ duyệt, thêm bằng mã tài khoản)

**Interfaces:**
- Consumes: `requireOwner`, `addMemberTx` (Task 8).
- Produces:
```ts
createInviteLink(db, actor, houseId): Promise<{ id; token; url: string; expiresAt: Date }>   // 7 ngày, token 32 ký tự ngẫu nhiên
revokeInviteLink(db, actor, linkId): Promise<void>
listInviteLinks(db, actor, houseId): Promise<{ id; url; expiresAt; revoked: boolean }[]>
acceptInvite(db, actor, token): Promise<{ houseId: string }>
requestJoinByCode(db, actor, code: string): Promise<{ requestId: string; houseName: string }>
cancelJoinRequest(db, actor, requestId): Promise<void>
listJoinRequests(db, actor, houseId): Promise<{ id; userId; displayName; createdAt }[]>
decideJoinRequest(db, actor, requestId, decision: 'approve'|'reject'): Promise<void>
addMemberByAccountCode(db, actor, houseId, accountCode: string): Promise<Member>
```
Lỗi (`reason`): `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_REVOKED`, `HOUSE_CODE_NOT_FOUND`, `ALREADY_MEMBER`, `REQUEST_PENDING`, `ACCOUNT_NOT_FOUND`, `HOUSE_ARCHIVED`. `acceptInvite` gọi lại khi đã là thành viên thì trả về houseId, không lỗi. Mã nhà và mã tài khoản không phân biệt hoa thường, tự bỏ khoảng trắng.

- [ ] **Step 1: Test thất bại**: mỗi `reason` ở trên có ít nhất một test. Thêm: link dùng được cho 2 người khác nhau; `acceptInvite` gọi 2 lần chỉ tạo 1 member; `approve` tạo member; `reject` không tạo; member gọi `decideJoinRequest` → FORBIDDEN; nhập `cg-7k2q ` vẫn tìm thấy nhà `CG-7K2Q`.
- [ ] **Step 2: FAIL → Step 3: cài đặt → Step 4: PASS.**
- [ ] **Step 5: UI**: `/moi/[token]`: chưa đăng nhập thì sang `/login?next=…`, đăng nhập rồi thì tự vào nhà, lỗi thì hiện câu tiếng Việt. `/vao-nha` theo `design/screens/Vào nhà.html`. Nút "Chia sẻ link mời" dùng `navigator.share`, không có thì sao chép vào clipboard.
- [ ] **Step 6: Commit** `feat(houses): invite links, join by house code, add by account code`

---

### Task 10: Cài đặt khoản cố định, bảng giá, ngân hàng

**Files:** Create `src/server/house-settings.ts`, `src/server/house-settings.test.ts`, `src/lib/validation.ts`; Modify `src/app/(app)/nha/page.tsx` (thêm các mục cài đặt), `src/app/(app)/nha/actions.ts`

**Interfaces:**
- Consumes: `requireOwner`, kiểu `Tariff`.
- Produces:
```ts
tariffSchema: z.ZodType<Tariff>   // tiers khác rỗng, upTo tăng dần, chỉ bậc cuối được null, price ≥ 0 nguyên, pct 0..100 (cho phép 1 chữ số thập phân), registeredPeople ≥ 1
upsertChargeItem(db, actor, houseId, input: { id?: string; name: string; kind: 'equal'|'per_unit'; amount: number; active: boolean }): Promise<string>
deleteChargeItem(db, actor, itemId): Promise<void>
reorderChargeItems(db, actor, houseId, ids: string[]): Promise<void>
setMemberQty(db, actor, memberId, itemId, qty: number): Promise<void>
setUtilityTariff(db, actor, houseId, utility: 'electricity'|'water', cfg: { mode: 'tiered'|'total'; tariff: Tariff | null }): Promise<void>
getHouseSettings(db, actor, houseId): Promise<{ items; qty; tariffs; bank; dueDay }>
```
- [ ] **Step 1: Test thất bại**: tariff có `upTo` giảm dần → INVALID; mode `'tiered'` mà `tariff=null` → INVALID; amount âm hoặc lẻ → INVALID; member gọi bất kỳ hàm ghi nào → FORBIDDEN; `setMemberQty` cho member của nhà khác → FORBIDDEN.
- [ ] **Step 2: FAIL → Step 3: cài đặt → Step 4: PASS.**
- [ ] **Step 5: UI**: các mục trong Quản lý nhà: Khoản cố định (thêm/sửa/xóa, chọn "Chia đều"/"Theo người"), Số lượng theo người (ví dụ số xe), Điện / Nước (chế độ, editor bảng bậc, VAT %, phụ phí, công tắc định mức theo số người, số người đăng ký), Ngân hàng (chọn ngân hàng theo danh sách mã BIN NAPAS lưu tĩnh trong repo, số tài khoản, tên chủ tài khoản), Hạn đóng (1–28). Ô nhập tiền dùng `inputmode="numeric"` và hiện phân cách nghìn ngay khi gõ.
- [ ] **Step 6: Commit** `feat(houses): fixed charges, tariffs, bank and due-day settings`

---

### Task 11: Vòng đời tháng và chi phát sinh

**Files:** Create `src/server/periods.ts`, `src/server/periods.test.ts`, `src/server/expenses.ts`, `src/server/expenses.test.ts`; Modify `src/server/house-settings.ts` (gọi `syncDraftPeriods` sau mỗi thao tác ghi), `src/server/invites.ts` + `src/server/houses.ts` (`addMemberTx` thêm member vào các tháng nháp với số ngày đủ tháng)

**Interfaces:**
- Consumes: `computePeriod`, `resolveExpenseMonth`, `dueDateFor`, `daysInMonth`, `consumptionMonthDefault`, `requireOwner`, `requireMember`.
- Produces:
```ts
getOrCreateDraftPeriod(db, actor, houseId, ym: YM): Promise<{ periodId: string }>   // CONFLICT 'PERIOD_CLOSED' nếu tháng đó đã chốt
// khi tạo: chép items đang active → period_items; tariffs → period_utilities (prev = curr của tháng trước nếu có);
// member đang hoạt động → period_members (days = daysInMonth, included = true, qty từ member_charge_qty)
syncDraftPeriods(tx, houseId): Promise<void>     // chép lại cấu hình nhà vào mọi tháng nháp, giữ nguyên số liệu đã nhập (prev/curr/total, days, included, enabled)
setUtilityReading(db, actor, periodId, utility, input: { prev?: number; curr?: number; total?: number }): Promise<void>
setPeriodMember(db, actor, periodId, memberId, input: { days?: number; included?: boolean }): Promise<void>   // days 0..daysInMonth
setPeriodItemEnabled(db, actor, periodItemId, enabled: boolean): Promise<void>
buildPeriodInput(db, periodId): Promise<PeriodInput>
previewPeriod(db, actor, periodId): Promise<PeriodResult>        // chỉ chủ nhà, cho tháng nháp
closePeriod(db, actor, periodId): Promise<void>                  // lưu result, status 'closed', closedAt
getPeriodView(db, actor, periodId): Promise<{ period; result: PeriodResult; members: PeriodMember[] }>   // member chỉ xem được tháng đã chốt
listPeriods(db, actor, houseId): Promise<{ id; year; month; status; grandTotal: number | null }[]>
addExpense(db, actor, houseId, input: { description: string; amount: number; spentOn: string; paidByMemberId: string; ym?: YM }): Promise<{ expenseId; ym: YM; movedFromClosed: boolean }>
updateExpense(db, actor, expenseId, patch): Promise<void>
deleteExpense(db, actor, expenseId): Promise<void>
```
Mọi thao tác ghi lên tháng **đã chốt** (reading, member, item, expense có `ym` chỉ định tháng đã chốt) đều tính lại `result`, `revision += 1`, rồi gọi `onPeriodUpdated(periodId)`. `closePeriod` gọi `onPeriodClosed(periodId)`. Hai hook này export từ `src/server/period-events.ts`; ở task này chúng chưa làm gì, Task 14 sẽ nối vào thông báo.

- [ ] **Step 1: Test thất bại**
```ts
// dựng lại đúng ví dụ spec §5.4 qua các hàm server → closePeriod → getPeriodView: due của an/binh/chi = 2_600_000 / 2_680_000 / 2_575_000
// tháng nháp: đổi giá tiền nhà trong settings → previewPeriod phản ánh giá mới
// tháng đã chốt: đổi giá tiền nhà trong settings → getPeriodView KHÔNG đổi (anti-goal của spec)
// tạo tháng 12 sau khi tháng 11 chốt: prev điện tháng 12 = curr điện tháng 11
// setUtilityReading curr < prev → INVALID 'READING_DECREASED' (Review Focus #2)
// thành viên bị removeMember sau khi chốt → getPeriodView vẫn có phiếu của người đó (Review Focus #4)
// member gọi closePeriod / setUtilityReading / addExpense → FORBIDDEN (Review Focus #5)
// member gọi getPeriodView tháng nháp → FORBIDDEN; tháng đã chốt → OK
// addExpense spentOn 2026-11-28 khi T11 đã chốt → ym {2026,12}, movedFromClosed true, tự tạo nháp T12
// sửa sau chốt → revision tăng 1, onPeriodUpdated được gọi đúng 1 lần (dùng vi.spyOn)
// thành viên mới vào nhà → có mặt trong tháng nháp hiện tại, không có trong tháng đã chốt
```
- [ ] **Step 2: FAIL → Step 3: cài đặt → Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(periods): monthly lifecycle, snapshots, expenses`

---

### Task 12: Màn hình chính: trang chủ, phiếu, hóa đơn, tạo mới

**Files:** Create `src/app/(app)/page.tsx`, `src/app/(app)/phieu/[periodId]/page.tsx`, `src/app/(app)/hoa-don/page.tsx`, `src/app/(app)/tao/page.tsx`, `src/app/(app)/tao/actions.ts`, `src/components/{Money,StatusPill,UtilityCard,PayslipLines,MemberRow,MonthHeader,Skeleton}.tsx`, `src/app/(app)/loading.tsx`

**Interfaces:**
- Consumes: `getPeriodView`, `listPeriods`, `previewPeriod`, các hàm ghi của Task 11, `paymentStatus` (tạm truyền danh sách rỗng, Task 13 nối dữ liệu thật).

Yêu cầu theo spec §10 (những gì khác mockup):
- **Trang chủ** (`design/screens/Trang chủ — tháng 11.html`): giữ thẻ tháng (số tháng lớn, mũi tên chuyển tháng), các ô Điện/Nước/khoản cố định. Với **thành viên**, dòng "mỗi người · chia 4" thay bằng **"Bạn cần chuyển X đ"** + trạng thái + 2 nút "Xem phiếu" và "Mã QR". Với chủ nhà là tiến độ "Đã thu X / Y đ". Danh sách "Thanh toán tháng này" hiện **số tiền riêng của từng người**.
- **Phiếu** (`design/screens/Biểu phí tháng 11.html`): nhóm Khoản cố định / Điện nước theo ngày ở / Chi phát sinh; mỗi dòng có `label`, `detail`, `amount`; khối cuối gồm "Tổng phần của bạn", "Trừ tiền đã ứng", "Cần chuyển cho <chủ nhà>". Khi `due < 0` thì ghi "Chủ nhà cần trả lại bạn X đ". Phiếu của chủ nhà ghi "Phần của bạn" và không có dòng cần chuyển. Chủ nhà có bộ chọn để xem phiếu của từng người.
- **Hóa đơn** (`design/screens/Hóa đơn tháng 11.html`): bộ lọc Tất cả / Chưa trả / Chờ duyệt / Đã trả (`owner_owes` và `partial` gộp vào Chưa trả), danh sách tháng trước.
- **Tạo** (`design/screens/Tạo hóa đơn tháng.html`): 2 tab "Hóa đơn tháng N" và "Khoản chi lẻ". Tab hóa đơn: ô điện và ô nước tùy theo chế độ (chỉ số cũ/mới hoặc ô tổng), công tắc khoản cố định, danh sách số ngày ở (stepper, mặc định đủ tháng) và công tắc "Tính tháng này", tổng tiền và số của từng người cập nhật khi đang gõ qua `previewPeriod` (debounce 300ms). Nút "Tạo & gửi hóa đơn" mở hộp xác nhận rồi gọi `closePeriod`. Tab chi lẻ: số tiền, nội dung, ngày, "Ai đã trả" (mặc định là mình), hiện ghi chú khi `movedFromClosed`.
- Không hiện dữ liệu cũ đã lưu: `loading.tsx` dùng skeleton.

- [ ] **Step 1: Kiểm tra trực quan**: `npm run dev`, Chrome DevTools giả lập iPhone 390×844. Đi qua cả 4 màn ở theme tối và sáng, bằng tài khoản chủ nhà và tài khoản thành viên, với dữ liệu ví dụ §5.4. Expected: số liệu khớp bảng §5.4; thành viên không thấy nút "+", "Sửa", "Xác nhận".
- [ ] **Step 2: `npm run build`** thành công, không có lỗi type.
- [ ] **Step 3: Commit** `feat(ui): home, payslip, bills and create screens`

---

### Task 13: Thanh toán: QR, báo đã chuyển, xác nhận, trả lại

**Files:** Create `src/lib/vietqr.ts`, `src/lib/vietqr.test.ts`, `src/server/payments.ts`, `src/server/payments.test.ts`, `src/components/QrSheet.tsx`, `src/components/ProofUpload.tsx`, `src/app/api/upload/route.ts`; Modify các màn của Task 12 (nút và trạng thái thật), `src/server/houses.ts` (`archiveHouse`, `leaveHouse` kiểm tra còn nợ)

**Interfaces:**
- Produces:
```ts
buildVietQrPayload(i: { bankBin: string; accountNo: string; amount: number; addInfo: string }): string   // EMVCo, CRC16-CCITT (0x1021, init 0xFFFF)
transferNote(displayName: string, ym: YM): string        // bỏ dấu, viết hoa, tối đa 25 ký tự: 'AN T11'
getStatuses(db, periodId): Promise<Record<string /*memberId*/, PaymentStatus>>
submitTransfer(db, actor, periodId, input: { proofUrl?: string }): Promise<{ paymentId: string }>     // amount = balance hiện tại; đã có pending thì trả về pending đó
confirmPayment(db, actor, paymentId): Promise<void>       // đã confirmed thì không làm gì
rejectPayment(db, actor, paymentId, reason: string): Promise<void>
recordCashPayment(db, actor, periodId, memberId, amount: number): Promise<void>   // tạo 'in' confirmed
recordRefund(db, actor, periodId, memberId, amount: number): Promise<void>        // tạo 'out' confirmed
hasOutstandingBalance(db, houseId, memberId?: string): Promise<boolean>           // mọi tháng đã chốt, balance ≠ 0
```
Ảnh chứng từ: client nén xuống dài nhất 1280px, JPEG khoảng 200KB, rồi upload lên Vercel Blob qua `/api/upload` (chỉ thành viên của nhà đó, tối đa 1MB, chỉ nhận ảnh).

- [ ] **Step 1: Test thất bại**
```ts
// vietqr: payload bắt đầu '000201', chứa '0208QRIBFTTA' (chuyển vào tài khoản), có trường 54 = '2600000', kết thúc bằng '6304'+4 hex,
//         và crc16(payload bỏ 4 ký tự cuối) === 4 ký tự cuối; người làm thêm 1 vector đối chiếu bằng app ngân hàng thật rồi ghi vào test
expect(transferNote('Nguyễn Văn An', {year:2026,month:11})).toBe('NGUYEN VAN AN T11')
// submitTransfer gọi 2 lần → đúng 1 payment pending (Review Focus #3)
// confirmPayment gọi 2 lần → status paid, confirmedIn = due, không gấp đôi (Review Focus #3)
// submitTransfer lên tháng nháp → INVALID 'PERIOD_NOT_CLOSED'
// member A confirmPayment → FORBIDDEN; member A submitTransfer thay member B → không làm được (luôn dùng member của actor)
// rejectPayment → status quay về unpaid; recordRefund cho owner_owes → paid
// sửa sau chốt làm due giảm dưới số đã trả → owner_owes
// archiveHouse khi còn nợ → CONFLICT 'UNPAID_PERIODS'; force:true → OK; leaveHouse khi còn nợ → CONFLICT 'HAS_BALANCE'
```
- [ ] **Step 2: FAIL → Step 3: cài đặt → Step 4: PASS.**
- [ ] **Step 5: UI**: QR sheet hiện ảnh QR (thư viện `qrcode`), số tiền, nội dung, nút sao chép số tài khoản; chủ nhà chưa khai ngân hàng thì hiện "Chủ nhà chưa cài tài khoản ngân hàng". "Tôi đã chuyển" kèm ảnh tùy chọn. Màn Hóa đơn: Xác nhận / Từ chối (nhập lý do) / Ghi tiền mặt / Đã trả lại, xem ảnh chứng từ.
- [ ] **Step 6: Commit** `feat(payments): VietQR, transfer proof, confirmation, refunds`

---

### Task 14: PWA, thông báo trong app, web push

**Files:** Create `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, `src/server/notifications.ts`, `src/server/notifications.test.ts`, `src/server/push.ts`, `src/app/(app)/thong-bao/page.tsx`, `src/components/{Bell,InstallGuide,PushToggle}.tsx`, `src/app/api/push/subscribe/route.ts`; Modify `src/server/period-events.ts`, `src/server/invites.ts`, `src/server/payments.ts` (tạo thông báo trong app)

**Interfaces:**
- Produces:
```ts
type PushSender = (sub: { endpoint; p256dh; auth }, payload: { title: string; body: string; url: string }) => Promise<'ok' | 'gone'>
notify(db, send: PushSender, n: { userIds: string[]; houseId: string | null; kind: NotificationKind; title: string; body: string; url: string; push: boolean }): Promise<void>
// 'gone' (404/410) → xóa subscription
type NotificationKind = 'period_closed'|'period_updated'|'owner_message'|'reminder'|'join_request'|'join_approved'|'join_rejected'|'transfer_submitted'|'payment_rejected'
sendHouseMessage(db, send, actor, houseId, input: { body: string; audience: 'all' | 'unpaid' }): Promise<{ recipients: number }>
remindMember(db, send, actor, periodId, memberId): Promise<void>
listNotifications(db, actor): Promise<...>; markAllRead(db, actor): Promise<void>; unreadCount(db, actor): Promise<number>
```
Nội dung cố định:
- `period_closed`: title `Tháng {M}: bạn cần chuyển {X}đ` (chủ nhà: `Đã chốt sổ tháng {M}`); trường hợp `owner_owes`: `Tháng {M}: chủ nhà cần trả lại bạn {X}đ`
- `period_updated`: `Phiếu tháng {M} đã cập nhật`
- `reminder`: `Nhắc đóng tiền tháng {M}: {X}đ`

`push: true` **chỉ** cho `period_closed`, `period_updated`, `owner_message`, `reminder`.

- [ ] **Step 1: Test thất bại** (dùng `PushSender` giả có ghi lại các lần gọi)
```ts
// closePeriod → mỗi thành viên included (trừ chủ nhà) nhận đúng 1 notification push với title đúng số tiền của mình; chủ nhà nhận 'Đã chốt sổ tháng 11'
// sendHouseMessage audience 'unpaid' → chỉ người có kind unpaid/partial/pending nhận
// requestJoinByCode → chủ nhà có notification 'join_request', PushSender KHÔNG được gọi
// PushSender trả 'gone' → subscription bị xóa
// member gọi sendHouseMessage / remindMember → FORBIDDEN
```
- [ ] **Step 2: FAIL → Step 3: cài đặt → Step 4: PASS.**
- [ ] **Step 5: Tra tài liệu mới nhất** của `web-push` và hướng dẫn PWA của Next.js (Context7), rồi cài: manifest (`display: standalone`, `lang: vi`, icon 180/192/512, `theme_color` theo token), `apple-touch-icon`, service worker (cache shell và font, xử lý `push` và `notificationclick` mở `url`), sinh khóa VAPID (`npx web-push generate-vapid-keys`). `InstallGuide`: hiện trên iOS Safari khi chưa ở chế độ standalone, hướng dẫn bấm "Chia sẻ → Thêm vào MH chính". `PushToggle` trong Cài đặt. Chuông ở trang chủ có chấm số chưa đọc.
- [ ] **Step 6: Commit** `feat(notifications): in-app notifications, web push, PWA`

---

### Task 15: Face ID, Cài đặt, responsive, e2e, deploy

**Files:** Create `src/app/(app)/cai-dat/page.tsx`, `src/components/PasskeyPrompt.tsx`, `e2e/main-flow.spec.ts`, `playwright.config.ts`; Modify `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: plugin passkey của Better Auth (đã cấu hình ở Task 6).

- [ ] **Step 1: Cài đặt** theo `design/screens/Cài đặt.html`: tên hiển thị, ngày sinh, mã tài khoản (nút sao chép), avatar với nút "Tạo hình mới" (`avatarVariant + 1`), Quản lý nhà (badge số yêu cầu chờ duyệt), Vào nhà khác, Đổi mật khẩu, Theme (Tự động/Sáng/Tối), Thông báo (PushToggle), Face ID (thêm/xóa passkey), Đăng xuất.
- [ ] **Step 2: Face ID**: sau lần đăng nhập bằng mật khẩu đầu tiên trên thiết bị có hỗ trợ WebAuthn, hiện `PasskeyPrompt` "Bật đăng nhập bằng Face ID?". Đăng ký passkey: `authClient.passkey.addPasskey()`. Màn đăng nhập: ô nhập dùng `autocomplete="username webauthn"` và `autocomplete="current-password webauthn"`; khi mount, nếu `PublicKeyCredential.isConditionalMediationAvailable()` thì gọi `authClient.signIn.passkey({ autoFill: true })`; thêm nút "Đăng nhập bằng Face ID" gọi `authClient.signIn.passkey()`.
- [ ] **Step 3: Responsive**: ≥ 768px thì nội dung nằm trong cột giữa rộng tối đa 560px, DioneBar vẫn ở đáy cột; `/admin` dùng bảng rộng. Kiểm ở 360, 390, 768, 1280px: không có cuộn ngang, không có chữ bị cắt.
- [ ] **Step 4: Viết e2e `e2e/main-flow.spec.ts`** (Playwright, viewport 390×844, DB test riêng): admin tạo 2 user → user1 tạo nhà, cài khoản cố định → user2 vào nhà bằng link → user1 nhập điện/nước, chi lẻ, chốt sổ → user2 thấy "Bạn cần chuyển" đúng số tiền và bấm "Tôi đã chuyển" → user1 xác nhận → user2 thấy "Đã trả".
- [ ] **Step 5: Chạy** `npx playwright test`: PASS. Chạy `npx vitest run`: tất cả PASS.
- [ ] **Step 6: Deploy**: tạo Neon project (region Singapore), chạy `drizzle-kit migrate`; tạo Vercel project nối repo, khai các biến trong `.env.example`, bật Vercel Blob; chạy lệnh `create-admin` ở Task 7 trỏ vào DB production.
- [ ] **Step 7: Kiểm tra trên iPhone thật**: mở bằng Safari, thêm vào MH chính, đăng nhập, bật Face ID, bật thông báo, chốt một tháng thử từ tài khoản khác. Expected: có thông báo đẩy, phiếu hiện đúng.
- [ ] **Step 8: Commit** `feat: settings, Face ID, responsive layout, e2e; deploy config`
