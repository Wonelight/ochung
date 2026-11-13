import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { AppError } from '@/lib/errors'
import { getHouseContext } from '@/server/current-house'
import { getPeriodExpenses } from '@/server/expenses'
import { LedgerDetail } from './_ui/ledger-detail'

export const metadata = { title: 'Chi tiết khoản chi' }

// Màn riêng liệt kê từng khoản chi lẻ của MỘT tháng (có thể ~60 khoản): lọc theo người trả, tìm theo nội dung, nhóm theo ngày.
// Mọi thành viên đang ở xem được, kể cả tháng còn nháp. Chỉ đọc; sửa/xóa khoản của mình ở trang Thêm khoản chi.
export default async function LedgerDetailPage({ params }: PageProps<'/chi-tieu/[periodId]'>) {
  const { actor, houses } = await getHouseContext()
  const { periodId } = await params
  let data
  try {
    data = await getPeriodExpenses(db, actor, periodId)
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound()
    if (e instanceof AppError && e.code === 'FORBIDDEN') redirect('/')
    throw e
  }
  const house = houses.find((h) => h.houseId === data.houseId)
  const canAdd = Boolean(house && !house.archived && !house.former)
  return (
    <main className="flex flex-col gap-3 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <PageHeader title={`Chi tiêu tháng ${data.ym.month}/${data.ym.year}`} backHref="/chi-tieu" />
      <div className="flex items-center gap-2">
        {data.status === 'draft' ? <StatusPill compact tone="draft" text="Đang nhập" /> : <StatusPill compact tone="neutral" text="Đã chốt" />}
        {canAdd && data.status === 'draft' && (
          <Link href="/tao?tab=chi-le" className="ml-auto flex h-10 items-center rounded-full border border-line2 bg-raised px-3 text-[13px] font-semibold text-accent-text no-underline">
            Thêm khoản chi
          </Link>
        )}
      </div>
      <LedgerDetail expenses={data.expenses} total={data.total} />
    </main>
  )
}
