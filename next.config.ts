import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (dev cục bộ `pglite:`) đọc tệp wasm/data bằng fs từ node_modules: không được bó vào chunk của Turbopack
  serverExternalPackages: ["@electric-sql/pglite"],
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
