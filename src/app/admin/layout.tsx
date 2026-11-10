import { guardRoute } from '@/server/guard'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await guardRoute()
  return children
}
