import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (dev cục bộ `pglite:`) đọc tệp wasm/data bằng fs từ node_modules: không được bó vào chunk của Turbopack
  serverExternalPackages: ["@electric-sql/pglite"],
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
