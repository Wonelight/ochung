# Chi tiêu nhà

Web app (PWA) chia chi tiêu trong nhà trọ theo tháng: chủ nhà nhập điện, nước, khoản cố định và chi lẻ, chốt sổ;
mỗi thành viên thấy phiếu và số tiền của mình, chuyển khoản qua mã QR và báo "Tôi đã chuyển".
Next.js (App Router) + Tailwind + Better Auth (mật khẩu và Face ID/passkey) + Drizzle + Postgres (Neon).

## Chạy trên máy

Không cần tài khoản Neon: dev cục bộ dùng PGlite (Postgres chạy trong tiến trình Node, lưu ở thư mục `.data/`).

```bash
npm install
cp .env.example .env.local   # sửa: DATABASE_URL=pglite:./.data/dev và BETTER_AUTH_SECRET=<chuỗi bất kỳ >= 32 ký tự>
```

`next dev` tự đọc `.env.local`. Các lệnh chạy ngoài Next (`db:migrate`, `auth create-admin`) không đọc tệp đó, nên khai biến cho phiên shell
(bash: `export DATABASE_URL=pglite:./.data/dev BETTER_AUTH_SECRET=...`; PowerShell: `$env:DATABASE_URL="pglite:./.data/dev"`):

```bash
npm run db:migrate                # áp migration vào DATABASE_URL
npx auth@latest create-admin ...  # tạo quản trị viên đầu tiên, xem mục bên dưới
npm run dev                       # http://localhost:3000
```

Để trống `VAPID_*` và `BLOB_READ_WRITE_TOKEN` thì app vẫn chạy: chỉ thiếu thông báo đẩy và ô đính kèm ảnh chuyển khoản.
Face ID (passkey) cần origin khớp `BETTER_AUTH_URL` (mặc định `http://localhost:3000`).

Kiểm thử:

```bash
npx vitest run         # unit test + test DB (PGlite trong bộ nhớ)
npx tsc --noEmit && npx eslint src
npx playwright install chromium   # một lần, tải trình duyệt cho e2e
npm run test:e2e       # luồng chính trên điện thoại 390×844: tự dựng DB pglite riêng (.data/e2e) và chạy next dev ở cổng 3100
```

## Tạo quản trị viên đầu tiên

Không có đăng ký công khai; tài khoản đầu tiên (quản trị viên) tạo bằng CLI của Better Auth
(`npx auth@latest`, gói `@better-auth/cli` cũ đã bị bỏ). Lệnh nạp `src/lib/auth.ts`, nên cần
`DATABASE_URL` (dev cục bộ: `pglite:./.data/dev`, đã chạy `npm run db:migrate`) và `BETTER_AUTH_SECRET`:

```bash
npx auth@latest create-admin \
  --email admin@nha.local --password "<mật-khẩu-tạm>" --name "Quản trị" \
  --data '{"username":"admin","accountCode":"U-00001","mustChangePassword":true}'
```

Lần đăng nhập đầu tiên (`/login`, tên đăng nhập `admin`) sẽ bị buộc đổi mật khẩu. Sau đó vào `/admin`
(Cài đặt > Quản trị tài khoản) để tạo tài khoản thành viên (mật khẩu tạm hiện một lần), đặt lại mật khẩu, khóa/mở khóa.
Nếu DB đã có người dùng, lệnh hỏi xác nhận trước khi tạo (bỏ qua bằng `--yes`).

## Triển khai

Mọi dịch vụ dưới đây đều có gói miễn phí (Vercel Hobby, Neon Free, Vercel Blob). Làm lần lượt:

### 1. Database trên Neon

1. Vào [neon.tech](https://neon.tech), tạo project mới, **Region: Singapore (`aws-ap-southeast-1`)** (gần Việt Nam nhất).
2. Mở **Connection Details**, chọn chuỗi kết nối có `sslmode=require` (dạng `postgres://user:pass@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`).
   Đây là giá trị `DATABASE_URL`.
3. Áp migration vào database đó từ máy của bạn:

   ```bash
   DATABASE_URL="postgres://…neon.tech/neondb?sslmode=require" npm run db:migrate
   ```

   (PowerShell: `$env:DATABASE_URL="postgres://…"; npm run db:migrate`.) Kết quả cuối: `Đã áp migration.`

### 2. Các khóa bí mật

| Biến | Cách lấy |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (hoặc bất kỳ chuỗi ngẫu nhiên dài từ 32 ký tự). Giữ bí mật, không đổi sau khi đã có người đăng nhập. |
| `BETTER_AUTH_URL` | **URL production của app**, ví dụ `https://chi-tieu-nha.vercel.app` (không có dấu `/` ở cuối). Face ID (passkey) lấy `rpID` từ tên miền này: đổi tên miền sau này thì mọi Face ID đã đăng ký phải thêm lại. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (in ra một cặp khóa). |
| `VAPID_SUBJECT` | `mailto:email-của-bạn@example.com` |
| `BLOB_READ_WRITE_TOKEN` | Do Vercel Blob cấp, xem bước 3. |

### 3. Vercel

1. Vào [vercel.com](https://vercel.com) > **Add New… > Project**, import repo git của dự án (gói **Hobby**). Framework tự nhận Next.js, giữ lệnh build mặc định (`next build`).
2. Trước khi bấm Deploy, mở **Environment Variables** và khai đủ các biến trong `.env.example`:
   `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
   **Chỉ tick Production, bỏ tick Preview và Development**: bản Preview (mỗi nhánh/PR) mà có các biến này sẽ chạy thẳng trên
   database production, và `BETTER_AUTH_URL` không khớp origin của URL preview nên đăng nhập, Face ID ở đó đều hỏng.
   Vùng chạy hàm đã đặt sẵn trong `vercel.json` (`"regions": ["sin1"]`, Singapore) cho cùng vùng với Neon ở bước 1:
   mặc định Vercel chạy ở `iad1` (Mỹ) và mỗi lần mở Trang chủ phải đi qua Thái Bình Dương hơn chục lượt truy vấn.
   Đổi vùng của Neon thì sửa vùng trong `vercel.json` theo.
3. Tab **Storage > Create > Blob**, tạo một Blob store và **Connect** vào project: Vercel tự thêm `BLOB_READ_WRITE_TOKEN`
   (ảnh minh chứng chuyển khoản được nén còn khoảng 200KB trước khi tải lên).
4. **Deploy**. Nếu `BETTER_AUTH_URL` chưa khớp URL thật Vercel cấp, sửa biến rồi **Redeploy**.
5. **Bản cập nhật có migration mới** (thư mục `drizzle/` có tệp mới): chạy `npm run db:migrate` vào Neon (như bước 1.3)
   **trước khi** promote bản deploy đó lên Production, nếu không mã mới sẽ chạy trên schema cũ.

Phiên đăng nhập không bật `session.cookieCache` của Better Auth (cố ý): mỗi lần đọc phiên là một truy vấn vào bảng `session`,
đổi lại việc khóa tài khoản và cờ "phải đổi mật khẩu tạm" có hiệu lực ngay. Bật cache thì trong `maxAge` giây trình duyệt vẫn
dùng bản phiên cũ trong cookie: người vừa bị khóa còn thao tác được, người vừa đổi mật khẩu tạm bị đưa lại màn đổi mật khẩu.

### 4. Tạo quản trị viên đầu tiên trên production

Chạy CLI ngay trên máy bạn nhưng trỏ vào database production (cùng `BETTER_AUTH_SECRET` và `BETTER_AUTH_URL` với Vercel):

```bash
DATABASE_URL="postgres://…neon.tech/neondb?sslmode=require" \
BETTER_AUTH_SECRET="<giống Vercel>" BETTER_AUTH_URL="https://<tên-miền-production>" \
npx auth@latest create-admin \
  --email admin@nha.local --password "<mật-khẩu-tạm>" --name "Quản trị" \
  --data '{"username":"admin","accountCode":"U-00001","mustChangePassword":true}'
```

Mở app, đăng nhập `admin` với mật khẩu tạm, đổi mật khẩu, rồi vào `/admin` tạo tài khoản cho các thành viên.

### 5. Kiểm tra trên iPhone thật

Face ID và thông báo đẩy chỉ kiểm được trên thiết bị thật, qua HTTPS (URL production):

1. Mở URL production bằng **Safari** > nút **Chia sẻ** > **Thêm vào MH chính** > **Thêm**. Mở app từ biểu tượng mới (thông báo đẩy trên iPhone chỉ chạy khi mở từ Màn hình chính).
2. Đăng nhập bằng tài khoản thành viên (đổi mật khẩu tạm ở lần đầu).
3. Khi app hỏi "Bật đăng nhập bằng Face ID?" chọn **Bật Face ID** (hoặc vào Cài đặt > Face ID). Đăng xuất rồi đăng nhập lại bằng **Đăng nhập bằng Face ID**.
4. Vào **Cài đặt > Thông báo đẩy**, bật công tắc và cho phép thông báo.
5. Từ một tài khoản chủ nhà khác (máy khác hoặc trình duyệt khác), tạo một tháng thử và **Tạo & gửi hóa đơn** (chốt sổ).
   Kết quả mong đợi: iPhone nhận thông báo đẩy, mở vào thấy phiếu đúng số tiền.
