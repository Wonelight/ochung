# Phiếu tháng: sửa UX sau đánh giá — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn phiếu (`/payslip/[periodId]`) và hàng "Thanh toán tháng này" ở Trang chủ hiện đúng số **còn phải chuyển**, rõ tháng, tách rõ "phần của một người" với "cả nhà", giải thích tiền đã ứng, và cho chủ nhà lối sang màn Hóa đơn để xử lý thanh toán.

**Architecture:** Logic hiển thị nằm trong các hàm thuần ở `src/lib` (`payments-view.ts`, `payslip-view.ts`) và chuỗi cách tính trong `src/lib/billing/compute.ts`, mỗi hàm có test vitest. Trang và component chỉ nối dữ liệu vào các hàm đó. Kết quả của tháng đã chốt được lưu sẵn trong `periods.result` (chuỗi `detail` cũ không đổi), nên câu điện nước của tháng cũ được viết lại **lúc hiển thị** trong `lineDetail`, không sửa DB.

**Tech Stack:** Next.js 16 (App Router, server components), React, Tailwind, vitest, TypeScript.

**Spec:** Không có file spec riêng. Plan này dựa trên hai báo cáo đánh giá UX (đọc code và xem màn thật ngày 20/11/2026) cùng các quyết định của chủ sản phẩm trong cuộc trò chuyện, chép lại ở mục "Quyết định" bên dưới.

## Quyết định (đã chốt với chủ sản phẩm)

- Tháng đã chốt: số chính của phiếu là **số còn phải chuyển** (`status.balance`), kèm dòng "Đã chuyển −X" khi đã nhận tiền. Cột số tiền ở Trang chủ và màn Hóa đơn cũng đổi theo.
- Chủ nhà không xác nhận ngay trên phiếu, chỉ có **một nút phụ sang màn Hóa đơn** (`/bills?period=<id>`).
- Thành viên chỉ xem phiếu của mình. Giữ nguyên.
- Câu cách tính của tháng đã chốt: **không sửa dữ liệu**. Viết lại câu điện nước lúc hiển thị. Câu chi lẻ và VAT chỉ đổi cho các lần tính mới.

## Global Constraints

- Mọi chữ hiển thị bằng tiếng Việt; số tiền qua `formatVnd` kèm " đ".
- Màu lấy từ token (`text-accent-text`, `text-muted`, `bg-inner`, `var(--c-accent-line)`…), không mã màu cứng.
- Vùng chạm ≥ 44px. Nhấn: `active:scale-[.97]` (DESIGN.md).
- Commit message chỉ mô tả thay đổi. **Không** thêm `Co-Authored-By` hay dòng "Generated with…".
- Lệnh kiểm: `npm test`, `npm run typecheck`, `npm run lint`.

## Review Focus

1. Phiếu người đã rời nhà, share 0, chỉ có tiền đã ứng và chủ nhà đã trả lại một phần (Dũng T10: ứng 1.200.000, đã nhận lại 500.000): phải ghi "Bạn cần trả lại Dũng 700.000 đ", liệt kê khoản đã ứng, và có câu giải thích thay cho "chưa có khoản nào". Test ở Task 2.
2. Đã trả đủ (balance 0): không còn số cam "Cần chuyển". Hàng Trang chủ vẫn hiện số của phiếu, không hiện 0 đ. Test ở Task 1 và Task 2.
3. Trả dư (confirmedIn > due, balance âm): phiếu ghi "Chủ nhà cần trả lại bạn" theo số dư. Test ở Task 2.
4. Câu điện nước của tháng cũ theo cả hai dạng "ngày-người" và "ngày ở" đều được viết lại; câu dạng mới không bị viết lại hai lần. Test ở Task 2.
5. Thành viên mở `?member=<id người khác>` vẫn chỉ thấy phiếu của mình, không thấy nút sang Hóa đơn. Kiểm tay ở Task 4.

---

## File Structure

| File | Thay đổi |
|---|---|
| `src/lib/payments-view.ts` (+ test) | `paymentRows`: số tiền = số còn lại; rút gọn ghi chú |
| `src/lib/payslip-view.ts` (+ test) | `settlement` nhận trạng thái thanh toán và cờ nháp; thêm `advancedItems`; `lineDetail` viết lại câu điện nước cũ; nhóm "Chi lẻ" |
| `src/lib/billing/compute.ts` (+ test) | Câu cách tính mới: điện nước, chi lẻ ghi số người chia, VAT có ngoặc |
| `src/app/(app)/payslip/[periodId]/page.tsx` | Tiêu đề tháng, tiêu đề "Cả nhà", nối `settlement` mới, khoản đã ứng, ghi chú tháng nháp, nút sang Hóa đơn, chip "Bạn", chống xuống dòng |
| `src/components/PayslipLines.tsx` | Prop `emptyText` |
| `src/app/(app)/payslip/[periodId]/_ui/subject-picker.tsx` | Client: cuộn tới chip đang chọn, viền cam cho chip đang chọn |
| `src/components/MemberRow.tsx` | Bỏ `aria-label`, thêm trạng thái nhấn |
| `src/components/UtilityCard.tsx` | Ô "Chỉ số" rộng hai cột |

---

### Task 1: Số tiền còn lại và ghi chú ngắn ở danh sách thanh toán

**Files:**
- Modify: `src/lib/payments-view.ts:115-137` (`paymentRows`)
- Test: `src/lib/payments-view.test.ts` (describe `paymentRows`)

**Interfaces:**
- Produces: `PaymentRow` giữ nguyên kiểu. `amount` đổi nghĩa: tháng đã chốt có trạng thái thì là `Math.abs(status.balance)`; `balance === 0` (đã xong) thì là `Math.abs(p.due)`; không có trạng thái thì là `Math.abs(p.due)` như cũ.

- [ ] **Step 1: Sửa và thêm test**
  - Trong test có sẵn "tháng đã chốt…", đổi kỳ vọng `note` của Bình từ `'Chủ nhà cần trả lại'` thành `'Được trả lại'`. Làm tương tự trong test "tháng nháp".
  - Thêm test `it('tháng đã chốt: số tiền là số còn lại theo khoản đã trả')`. Dùng `slips` có sẵn và `statusesFor(slips, { an: [{ direction: 'in', amount: 1_000_000, status: 'confirmed' }], binh: [{ direction: 'out', amount: 100_000, status: 'confirmed' }] })`. Kỳ vọng: An `amount` `1_600_000`, Bình `amount` `200_000`.
  - Thêm test `it('đã trả đủ: vẫn hiện số của phiếu, không phải 0')`. An trả đủ `2_600_000` confirmed. Kỳ vọng: An `amount` `2_600_000`, `note` `'Đã trả đủ'`.
  - Thêm test `it('đã báo chuyển: ghi chú ngắn "Đã báo chuyển"')`. An có bản ghi `pending` 2_600_000. Kỳ vọng: `note` `'Đã báo chuyển'`.

- [ ] **Step 2: Chạy để thấy test fail**
  Run: `npx vitest run src/lib/payments-view.test.ts`
  Expected: FAIL ở các kỳ vọng `amount` và `note` mới.

- [ ] **Step 3: Sửa `paymentRows`**
  - `amount` theo Interfaces.
  - `note`: `'Chủ nhà cần trả lại'` → `'Được trả lại'`; `'Đã báo chuyển khoản'` → `'Đã báo chuyển'`.
  - Cập nhật chú thích của trường `amount` trong `PaymentRow`.

- [ ] **Step 4: Chạy lại test**
  Run: `npx vitest run src/lib/payments-view.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add src/lib/payments-view.ts src/lib/payments-view.test.ts`
  `git commit -m "fix(home): payment rows show the remaining balance; shorter row notes"`

---

### Task 2: Khối tổng kết phiếu theo trạng thái thanh toán, khoản đã ứng, câu điện nước cũ

**Files:**
- Modify: `src/lib/payslip-view.ts`
- Test: `src/lib/payslip-view.test.ts`

**Interfaces:**
- Consumes: `PaymentStatus` (`src/lib/billing/types.ts`), `dayMonth` (`src/lib/vn-time.ts`).
- Produces:
  ```ts
  export type AdvancedItem = { key: string; label: string; amount: number }
  export function advancedItems(
    memberId: string,
    expenses: { id: string; description: string; amount: number; paidByMemberId: string; spentOn: string }[],
  ): AdvancedItem[]
  export type Settlement = {
    rows: { label: string; amount: number; items?: AdvancedItem[] }[]
    /** amount null: đã thanh toán xong, không có số. muted: số không tô màu nhấn (tháng nháp, đã xong). */
    final: { label: string; amount: number | null; muted: boolean }
  }
  export function settlement(
    slip: Payslip,
    who: { self: boolean; name: string; ownerName: string },
    opts: { status?: PaymentStatus; draft: boolean; advanced?: AdvancedItem[] },
  ): Settlement
  ```
  Trường `refund` bị bỏ. Trước khi bỏ, grep `final.refund` để chắc không còn chỗ nào dùng.

**Quy tắc của `settlement`**

`ownerName` viết tắt là `O`, `name` viết tắt là `N`.

- **Phiếu chủ nhà (`due === null`):** như cũ, `muted: false`.
- **`rows`:**
  - Luôn có "Tổng phần của bạn / của N" với `share`.
  - "Trừ tiền đã ứng" (`-advanced`, `items: opts.advanced`) **chỉ khi `advanced > 0`**.
  - Có `status` và `confirmedIn > 0` thì thêm "Đã chuyển" với `-confirmedIn`.
  - Có `status` và `confirmedOut > 0` thì thêm "Chủ nhà đã trả lại" với `+confirmedOut`.
- **`final`, tháng nháp (`draft: true`, không có status), `muted: true`, số theo `due`:**
  - `due ≥ 0`: self "Dự kiến cần chuyển cho O"; người khác "N dự kiến cần chuyển cho bạn".
  - `due < 0`: self "Chủ nhà dự kiến trả lại bạn"; người khác "Bạn dự kiến trả lại N"; số là `-due`.
- **`final`, có `status`, theo `b = status.balance`:**
  - `b > 0`: chưa nhận đồng nào thì self "Cần chuyển cho O", người khác "N cần chuyển cho bạn". Đã nhận một phần (`confirmedIn > 0`) thì self "Bạn còn thiếu", người khác "N còn thiếu". Số là `b`, `muted: false`.
  - `b < 0`: self "Chủ nhà cần trả lại bạn"; người khác "Bạn cần trả lại N"; số là `-b`, `muted: false`.
  - `b === 0`: self "Bạn đã thanh toán đủ"; người khác "N đã thanh toán đủ"; `amount: null`, `muted: true`.
- **`final`, không nháp và không có status** (phòng hờ): nhãn như code hiện tại, `muted: false`.

**Quy tắc của `advancedItems`:** các khoản có `paidByMemberId === memberId`, theo thứ tự đầu vào; `key: e.id`; `label: \`${e.description} · ${dayMonth(e.spentOn)}\``; `amount: e.amount`.

**Quy tắc của `lineDetail` cho nhóm `utility`:**
- Khớp `/^(.+) ÷ (\d+) (?:ngày-người|ngày ở) × (\d+)$/` thì viết lại thành `Ở ${d}/${N} ngày của cả nhà · tổng ${X}`.
- Không khớp thì giữ nguyên.

**Đổi tên nhóm:** `LINE_GROUPS` nhóm `expense`: `'Chi phát sinh'` → `'Chi lẻ'`.

- [ ] **Step 1: Viết lại describe `settlement` và thêm test mới**
  - Cập nhật bốn test cũ cho chữ ký mới: thêm `{ draft: false }` và đổi `refund` thành `muted`. Riêng test đầu (advanced 200_000) giữ nguyên các dòng.
  - Thêm các test sau, ghi đúng số trong ngoặc:
    - `it('không ứng tiền: không có dòng "Trừ tiền đã ứng"')`: `slip(2_680_000, 0, 2_680_000)` → `rows.length === 1`.
    - `it('trả một phần: dòng "Đã chuyển", số chính là số còn thiếu')`: `slip(1_963_788, 0, 1_963_788)`, status `{ kind: 'partial', balance: 981_894, confirmedIn: 981_894, confirmedOut: 0 }`, người khác tên Chi → rows `[Tổng phần của Chi 1_963_788, Đã chuyển −981_894]`, final `{ label: 'Chi còn thiếu', amount: 981_894, muted: false }`.
    - `it('đã thanh toán đủ: không còn số phải chuyển')`: status `{ kind: 'paid', balance: 0, confirmedIn: 2_653_698, confirmedOut: 0 }` → final `{ label: 'An đã thanh toán đủ', amount: null, muted: true }`.
    - `it('người rời nhà chỉ còn tiền đã ứng, chủ nhà trả lại một phần')`: `slip(0, 1_200_000, -1_200_000)`, status `{ kind: 'owner_owes', balance: -700_000, confirmedIn: 0, confirmedOut: 500_000 }`, `advanced: [{ key: 'e9', label: 'Máy lọc nước · 20/10', amount: 1_200_000 }]` → rows `[Tổng phần của Dũng 0, Trừ tiền đã ứng −1_200_000 (items như trên), Chủ nhà đã trả lại 500_000]`, final `{ label: 'Bạn cần trả lại Dũng', amount: 700_000, muted: false }`.
    - `it('trả dư: chủ nhà cần trả lại phần dư')`: `slip(2_500_000, 0, 2_500_000)`, status `{ kind: 'owner_owes', balance: -100_000, confirmedIn: 2_600_000, confirmedOut: 0 }`, self → final `{ label: 'Chủ nhà cần trả lại bạn', amount: 100_000, muted: false }`.
    - `it('tháng nháp: "Dự kiến…", không tô màu')`: self `slip(2_233_016, 0, 2_233_016)`, `draft: true` → final `{ label: 'Dự kiến cần chuyển cho Linh', amount: 2_233_016, muted: true }`. Người khác `slip(0, 50_000, -50_000)` → label `'Bạn dự kiến trả lại Bình'`, amount `50_000`.
  - Thêm `describe('advancedItems')`. Hai khoản của `dung` và một khoản của `an` → chỉ trả hai khoản của `dung`, với `label: 'Máy lọc nước · 20/10'` cho `spentOn '2026-10-20'`.
  - Thêm test `lineDetail` cho điện nước:
    - `'462.024 ÷ 113 ngày-người × 20'` → `'Ở 20/113 ngày của cả nhà · tổng 462.024'`.
    - `'111.564 ÷ 120 ngày ở × 30'` → `'Ở 30/120 ngày của cả nhà · tổng 111.564'`.
    - `'Ở 30/120 ngày của cả nhà · tổng 111.564'` giữ nguyên.
    - `'1.000.000 ÷ 4'` (chia đều khi tổng ngày = 0) giữ nguyên.
  - Đổi kỳ vọng tên nhóm ở test `groupLines` thành `'Chi lẻ'`.

- [ ] **Step 2: Chạy để thấy test fail**
  Run: `npx vitest run src/lib/payslip-view.test.ts`
  Expected: FAIL (`advancedItems` chưa có; chữ ký `settlement` sai).

- [ ] **Step 3: Cài đặt theo các quy tắc ở trên trong `src/lib/payslip-view.ts`**

- [ ] **Step 4: Chạy lại test**
  Run: `npx vitest run src/lib/payslip-view.test.ts`
  Expected: PASS. `npm run typecheck` lúc này sẽ báo lỗi ở `payslip/[periodId]/page.tsx`. Task 4 sửa chỗ đó; không sửa trang trong task này.

- [ ] **Step 5: Commit**
  `git add src/lib/payslip-view.ts src/lib/payslip-view.test.ts`
  `git commit -m "feat(payslip): settlement follows payments; list advanced expenses; clearer utility line"`

---

### Task 3: Câu cách tính mới khi tính phiếu

**Files:**
- Modify: `src/lib/billing/compute.ts:169`, `:205`, `:230`
- Test: `src/lib/billing/compute.test.ts:110-113`, `:302`, `:655`, `:695`, `:715`, `:739`

**Interfaces:**
- Produces: chuỗi `PayslipLine.detail` mới. Task 2 đã bảo đảm `lineDetail` không viết lại câu điện nước dạng mới.

**Ba chuỗi mới:**
- Điện nước chia theo ngày: `` `Ở ${m.days}/${sumDays} ngày của cả nhà · tổng ${formatVnd(result.total)}` ``.
- Chi lẻ: luôn ghi `` ` · chia ${takers.length} người` `` (bỏ chữ "cho"; cả nhà cũng ghi).
- Khoản cố định chia đều có VAT: `` `(${formatVnd(item.amount)}${vatNote(item.vatPct)}) ÷ ${M}` ``. Không VAT thì giữ `` `${formatVnd(item.amount)} ÷ ${M}` ``. Khoản theo người giữ nguyên.

- [ ] **Step 1: Sửa kỳ vọng trong test**
  - `:110` → `'Ở 15/105 ngày của cả nhà · tổng 1.260.000'`.
  - `:111` → `'Ở 15/105 ngày của cả nhà · tổng 315.000'`.
  - `:112` → `'An trả 200.000 · 20/11 · chia 4 người'`.
  - `:113` → `'Linh trả 120.000 · 5/11 · chia 4 người'`.
  - `:302`: chuỗi tương ứng theo dạng mới (`'Ở 30/60 ngày của cả nhà · tổng 600'`).
  - `:655` → `'An trả 300.000 · 20/11 · chia 2 người'`.
  - `:695` → `'An trả 300.000 · 20/11 · chia 4 người'`, sửa luôn chú thích cuối dòng. Kiểm số thành viên của fixture đó; nếu khác 4 thì dùng đúng số.
  - `:715` → `'(1.000.000 + VAT 10%) ÷ 4'`.
  - `:739` → `'(1.000.000 + VAT 8,5%) ÷ 1'`.

- [ ] **Step 2: Chạy để thấy test fail**
  Run: `npx vitest run src/lib/billing/compute.test.ts`
  Expected: FAIL đúng ở các dòng trên.

- [ ] **Step 3: Sửa ba chuỗi trong `compute.ts` theo trên**

- [ ] **Step 4: Chạy toàn bộ test**
  Run: `npm test`
  Expected: PASS. Nếu test khác (ví dụ `period-edits`, `home-tiles`) có chép chuỗi cũ, sửa kỳ vọng theo dạng mới.

- [ ] **Step 5: Commit**
  `git add src/lib/billing/compute.ts src/lib/billing/compute.test.ts`
  `git commit -m "feat(billing): clearer per-line formulas (days of the house, split count, VAT grouping)"`

---

### Task 4: Màn phiếu

**Files:**
- Modify: `src/app/(app)/payslip/[periodId]/page.tsx`
- Modify: `src/components/PayslipLines.tsx`

**Interfaces:**
- Consumes: `settlement`, `advancedItems` (Task 2); `secondaryLinkClass` từ `../../_ui/month-hero`.
- Produces: `PayslipLines` nhận thêm `emptyText?: string`, mặc định `'Phiếu này chưa có khoản nào.'`.

- [ ] **Step 1: Tiêu đề**
  - `metadata.title` → `'Phiếu tháng'`.
  - h1 (`:81`) → `Phiếu tháng {period.month}/{period.year}`.

- [ ] **Step 2: Nối `settlement` mới**
  - Gọi `settlement(slip, who, { status, draft: period.status === 'draft', advanced: advancedItems(slip.memberId, view.expenses) })`.
  - Mỗi row có `items`: dưới dòng chính, vẽ từng item thành một dòng 12px `text-muted`, nhãn bên trái, số bên phải. Thụt trái `pl-3`.
  - `final.amount === null`: không vẽ số, nhãn dùng `text-[15px] font-semibold`.
  - `final.muted`: số dùng `text-text` thay cho `text-accent-text`.
  - Tháng nháp và `slip.due !== null`: thêm `<p className="m-0 text-[13px] text-muted">Chủ nhà chưa chốt sổ, số có thể còn đổi.</p>` ở cuối khối tổng kết.
  - Số tiền (`:117`, `:123`) thêm `whitespace-nowrap shrink-0`.

- [ ] **Step 3: Phiếu không có dòng nào**
  - Khi `slip.lines` sau `visibleLines` rỗng và `slip.advanced > 0`, truyền `emptyText="Không được tính tháng này, chỉ hoàn lại khoản đã ứng."` cho `PayslipLines`.
  - Trong `PayslipLines`, dùng `emptyText` thay cho câu cứng.

- [ ] **Step 4: Nút của chủ nhà sang Hóa đơn**
  - Điều kiện: `isOwner && !self && period.status === 'closed' && status && status.kind !== 'paid'`.
  - Vẽ `<Link href={\`/bills?period=${period.id}\`} className={secondaryLinkClass}>`, đặt ngay dưới khối tổng kết, cùng chỗ với nút QR.
  - Nhãn: `status.kind === 'pending'` thì `'Xác nhận ở Hóa đơn'`, còn lại `'Ghi thanh toán ở Hóa đơn'`.

- [ ] **Step 5: Thẻ cả nhà**
  - Thêm `<h2 className="m-0 text-[17px] font-semibold">Cả nhà tháng {period.month}</h2>` ngay trước `<section>` thẻ tháng.
  - `aria-label` của section → `Cả nhà tháng {m} năm {y}`.
  - "Tổng tháng" (`:165`) → "Tổng cả nhà".

- [ ] **Step 6: Chip của chủ nhà**
  Trong `people` truyền cho `SubjectPicker`, `name` của `viewer.memberId` là `'Bạn'`.

- [ ] **Step 7: Kiểm**
  - Run: `npm run typecheck && npm run lint && npm test`. Expected: không lỗi.
  - Mở `npm run dev` ở khổ 390px. Đăng nhập `linh` (chủ Nhà Cầu Giấy) và `chi` (thành viên), mật khẩu mẫu trong `scripts/seed-dev.mts`. Kiểm:
    - Chi T9: số chính "Bạn còn thiếu 981.894 đ", khớp với QR.
    - Dũng T10 (từ `linh`): "Bạn cần trả lại Dũng 700.000 đ", có dòng "Máy lọc nước", có câu giải thích.
    - An T10: "An đã thanh toán đủ", không có số cam.
    - Bình T10: có nút "Xác nhận ở Hóa đơn".
    - T11: "Dự kiến…" kèm câu chưa chốt sổ.
    - `chi` mở `?member=<id An>` vẫn thấy phiếu của Chi và không có nút Hóa đơn.

- [ ] **Step 8: Commit**
  `git add "src/app/(app)/payslip/[periodId]/page.tsx" src/components/PayslipLines.tsx`
  `git commit -m "feat(payslip): month in title, house section labeled, remaining balance, link to bills for owner"`

---

### Task 5: Chip chọn người, hàng Trang chủ, thẻ Điện

**Files:**
- Modify: `src/app/(app)/payslip/[periodId]/_ui/subject-picker.tsx`
- Modify: `src/components/MemberRow.tsx`
- Modify: `src/components/UtilityCard.tsx:15-22`, `:50-54`

- [ ] **Step 1: SubjectPicker**
  - Thêm `'use client'`.
  - `useRef<HTMLElement>` cho `<nav>`. `useEffect` theo `selectedId` gọi `ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })`.
  - Class của chip đang chọn → `bg-inner text-text shadow-[inset_0_0_0_1.5px_var(--c-accent-line)]`. Sửa chú thích đầu file cho khớp.

- [ ] **Step 2: MemberRow**
  - Bỏ `aria-label` trên `Link`, để tên link lấy từ nội dung hàng.
  - Thêm `transition-transform active:scale-[.97]` vào class của `Link`.

- [ ] **Step 3: UtilityCard**
  - `Cell` nhận `className?: string`.
  - Lưới `grid-cols-3` → `grid-cols-2`; ô "Chỉ số" thêm `col-span-2`.

- [ ] **Step 4: Kiểm**
  - Run: `npm run typecheck && npm run lint`.
  - Ở khổ 390px, dùng tài khoản `linh`:
    - Từ Trang chủ T10 bấm hàng của Dũng: chip "Dũng" tự cuộn vào giữa và có viền cam.
    - Ghi chú các hàng ở Trang chủ không xuống hai dòng.
    - Ô "Chỉ số" của thẻ Điện nằm trên một dòng.
  - Snapshot cây trợ năng: tên link của hàng có số tiền và trạng thái.

- [ ] **Step 5: Commit**
  `git add "src/app/(app)/payslip/[periodId]/_ui/subject-picker.tsx" src/components/MemberRow.tsx src/components/UtilityCard.tsx`
  `git commit -m "fix(ui): selected person chip scrolls into view; readable home rows; meter reading on one line"`

---

## Ngoài phạm vi (ghi lại để làm sau)

- Nút Quay lại tạo vòng lặp lịch sử.
- Ghi chú cho nhà đã lưu trữ.
- Nhãn "Đã rời nhà" trên chip.
- "Bạn trả" thay cho tên mình ở dòng chi lẻ.
- Ghi chú hàng Trang chủ tháng nháp chưa nhất quán.
- Mũi tên mở/đóng của nhóm chi lẻ gập lại.
- Tiêu đề nhóm 12px viết hoa.
- Câu chi lẻ và VAT của tháng đã chốt giữ chữ cũ (theo quyết định không sửa dữ liệu).
