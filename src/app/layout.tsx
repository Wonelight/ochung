import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Lexend_Exa } from "next/font/google";
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
