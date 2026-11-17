import type { NextConfig } from "next";

// Địa chỉ trang ở dạng tiếng Anh. Địa chỉ tiếng Việt cũ vẫn được chuyển hướng vĩnh viễn (giữ nguyên tham số truy vấn),
// vì link mời `/moi/<token>` đã gửi qua Zalo/Messenger và thông báo đẩy cũ còn nằm trên máy người dùng.
const LEGACY_ROUTES: [from: string, to: string][] = [
  ["/moi/:token", "/invite/:token"],
  ["/cai-dat", "/settings"],
  ["/chi-tieu", "/expenses"],
  ["/chi-tieu/:periodId", "/expenses/:periodId"],
  ["/hoa-don", "/bills"],
  ["/nha/moi", "/house/new"], // đứng trước `/nha` cho dễ đọc; hai nguồn khác nhau nên thứ tự không ảnh hưởng
  ["/nha", "/house"],
  ["/phieu/:periodId", "/payslip/:periodId"],
  ["/tao", "/create"],
  ["/thong-bao", "/notifications"],
  ["/vao-nha", "/join"],
  ["/doi-mat-khau", "/change-password"],
];

const nextConfig: NextConfig = {
  // PGlite (dev cục bộ `pglite:`) đọc tệp wasm/data bằng fs từ node_modules: không được bó vào chunk của Turbopack
  serverExternalPackages: ["@electric-sql/pglite"],
  async redirects() {
    return LEGACY_ROUTES.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  async headers() {
    return [
      {
        // service worker luôn tải mới để bản cập nhật có hiệu lực ngay
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
