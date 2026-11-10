This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

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
để tạo tài khoản thành viên (mật khẩu tạm hiện một lần), đặt lại mật khẩu, khóa/mở khóa.
Nếu DB đã có người dùng, lệnh hỏi xác nhận trước khi tạo (bỏ qua bằng `--yes`).
