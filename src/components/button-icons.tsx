// Biểu tượng đi kèm nút theo quy tắc nút (xem button-styles.ts): Thêm luôn có dấu +, Xóa có thùng rác, Bỏ dòng có X.
// Màu theo chữ của nút (currentColor); aria-hidden vì nhãn chữ của nút đã đủ nghĩa.

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} strokeWidth="2.4" {...svg}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} strokeWidth="2" {...svg}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} strokeWidth="2" {...svg}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
