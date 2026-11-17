-- Từ nay đăng ký công khai bắt xác nhận email bằng mã OTP (requireEmailVerification), nên đăng nhập bị chặn với mọi tài khoản
-- chưa xác nhận. Tài khoản do quản trị viên cấp dùng email giả `<tên>@nha.local` (không nhận được thư) vốn đang là false:
-- đánh dấu đã xác nhận để họ không bị khóa khỏi đăng nhập.
UPDATE "user" SET "email_verified" = true WHERE "email" LIKE '%@nha.local' AND "email_verified" = false;
