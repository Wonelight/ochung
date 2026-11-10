/** Khối giữ chỗ khi đang tải: không hiện số cũ, chỉ hình khối mờ theo bố cục của trang. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[12px] bg-inner ${className}`} />
}
