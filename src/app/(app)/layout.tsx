import { guardRoute } from '@/server/guard'

// Khung các trang cần đăng nhập; Task 8 mở rộng (thanh điều hướng, ngữ cảnh nhà).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await guardRoute()
  return children
}
