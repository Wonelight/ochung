<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quy ước địa chỉ trang (URL)

Địa chỉ trang, tên thư mục route và tham số truy vấn luôn là **tiếng Anh, chữ thường, nối bằng dấu gạch ngang** (`/settings`, `/change-password`, `/house/new`, `?period=`). Chỉ chữ hiển thị cho người dùng mới là tiếng Việt. Không đặt route kiểu `/cai-dat`, `/vao-nha`.

| Địa chỉ | Trang | | Địa chỉ | Trang |
|---|---|---|---|---|
| `/` | Trang chủ | | `/create` | Tạo hóa đơn / chi lẻ (`?tab=expense`, `?period=`) |
| `/bills` | Hóa đơn (`?period=`) | | `/notifications` | Thông báo |
| `/payslip/[periodId]` | Phiếu thanh toán (`?member=`) | | `/join` | Vào nhà |
| `/expenses`, `/expenses/[periodId]` | Chi tiêu | | `/invite/[token]` | Link mời vào nhà |
| `/house`, `/house/new` | Quản lý nhà, tạo nhà | | `/login`, `/forgot-password`, `/change-password` | Đăng nhập, quên / đổi mật khẩu |
| `/settings` | Cài đặt | | `/admin` | Quản trị tài khoản |

Khi đổi tên một route đã phát hành, thêm chuyển hướng vĩnh viễn từ địa chỉ cũ vào `LEGACY_ROUTES` trong `next.config.ts` (link mời đã gửi qua Zalo và thông báo đẩy cũ vẫn phải mở được), và cho trang đọc cả tham số truy vấn cũ (xem `legacyPeriod` trong `src/app/(app)/_lib/period-data.ts`). Đổi tên thư mục khi dev server đang chạy bị Windows từ chối: sao chép sang tên mới rồi xóa thư mục cũ.
