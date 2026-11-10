import { Skeleton } from '@/components/Skeleton'

// Khung chờ của các trang trong app: hình khối theo bố cục Trang chủ (đầu trang, thẻ tháng, danh sách),
// không hiện số liệu cũ đã lưu trong bộ nhớ đệm.
export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Đang tải"
      className="flex flex-col gap-[18px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="size-11 rounded-full" />
      </div>
      <div className="flex flex-col gap-[18px] rounded-[28px] border border-line bg-card p-[18px]">
        <div className="flex items-end justify-between">
          <Skeleton className="h-12 w-24" />
          <div className="flex gap-2">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-[3px]" />
        <div className="grid grid-cols-2 gap-2.5">
          <Skeleton className="h-[104px] rounded-[18px]" />
          <Skeleton className="h-[104px] rounded-[18px]" />
          <Skeleton className="col-span-2 h-[60px] rounded-[18px]" />
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-3.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </main>
  )
}
