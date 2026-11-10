import { PageHeader } from '@/components/PageHeader'
import { getHouseContext } from '@/server/current-house'
import { CreateHouseForm } from '../_ui/create-house-form'

export const metadata = { title: 'Tạo nhà mới' }

// Màn không có trong mockup: dùng lại đầu trang, thẻ, ô nhập và nút của màn Quản lý nhà.
export default async function NewHousePage() {
  const { current } = await getHouseContext()
  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <PageHeader title="Tạo nhà mới" backHref={current ? '/' : undefined} />
      <CreateHouseForm />
    </main>
  )
}
