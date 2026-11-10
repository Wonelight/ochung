import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Lexend_Exa } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const body = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const num = Lexend_Exa({
  variable: "--font-num",
  subsets: ["vietnamese", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chi tiêu nhà",
  description: "Chia chi tiêu trong nhà trọ theo từng tháng",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS: mở từ Màn hình chính ở chế độ app (apple-mobile-web-app-capable). Thanh trạng thái đen đọc được ở cả hai theme.
  appleWebApp: { capable: true, title: "Chi tiêu nhà", statusBarStyle: "black" },
  // Next 16 chỉ xuất mobile-web-app-capable; iOS cũ vẫn đọc thẻ apple-mobile-web-app-capable.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0E0B08",
};

// Cookie `theme` = light|dark ghi đè prefers-color-scheme. Đặt data-theme trước
// khi vẽ để không bị nháy; không đọc cookie phía server nên trang vẫn tĩnh.
const themeScript = `try{var m=document.cookie.match(/(?:^|; )theme=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${body.variable} ${num.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
