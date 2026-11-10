// Ô icon 32×32 bo 10 với cặp màu theo loại khoản, icon SVG chép từ mockup `Trang chủ — tháng 11`
// (điện, nước, internet, rác & gửi xe, tiền nhà). `receipt` (chi lẻ) không có trong mockup: icon cùng nét 1.8, màu của nhóm rác.
export type CategoryKind = 'elec' | 'water' | 'net' | 'trash' | 'rent' | 'receipt'

const PALETTE: Record<CategoryKind, string> = {
  elec: 'bg-elec-bg text-elec-fg',
  water: 'bg-water-bg text-water-fg',
  net: 'bg-net-bg text-net-fg',
  trash: 'bg-trash-bg text-trash-fg',
  rent: 'bg-rent-bg text-rent-fg',
  receipt: 'bg-trash-bg text-trash-fg',
}

/** Màu chấm 8px trước tên khoản (danh sách khoản trong mockup Biểu phí). */
export const DOT: Record<CategoryKind, string> = {
  elec: 'bg-elec-fg',
  water: 'bg-water-fg',
  net: 'bg-net-fg',
  trash: 'bg-trash-fg',
  rent: 'bg-rent-fg',
  receipt: 'bg-trash-fg',
}

function Paths({ kind }: { kind: CategoryKind }) {
  switch (kind) {
    case 'elec':
      return <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    case 'water':
      return <path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" />
    case 'net':
      return (
        <>
          <path d="M2 9a15 15 0 0 1 20 0" />
          <path d="M5 12.5a10 10 0 0 1 14 0" />
          <path d="M8.5 16a5 5 0 0 1 7 0" />
          <path d="M12 19.5h.01" />
        </>
      )
    case 'trash':
      return (
        <>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M6 6l1 14h10l1-14" />
        </>
      )
    case 'rent':
      return (
        <>
          <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
          <path d="M3 21h18" />
          <path d="M14.5 12h.01" />
        </>
      )
    case 'receipt':
      return (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
        </>
      )
  }
}

export function CategoryIcon({ kind }: { kind: CategoryKind }) {
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${PALETTE[kind]}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Paths kind={kind} />
      </svg>
    </span>
  )
}

/** Icon theo tên khoản cố định (như mockup: Internet → wifi, Rác/Gửi xe → thùng rác, Tiền nhà → tòa nhà). */
export function itemIconKind(name: string, kind: 'equal' | 'per_unit'): CategoryKind {
  const n = name.toLocaleLowerCase('vi')
  if (/internet|wifi|wi-fi|mạng|truyền hình|cáp/.test(n)) return 'net'
  if (/rác|xe|vệ sinh/.test(n)) return 'trash'
  if (/nhà|phòng|thuê|dịch vụ|quản lý/.test(n)) return 'rent'
  return kind === 'per_unit' ? 'trash' : 'rent'
}
