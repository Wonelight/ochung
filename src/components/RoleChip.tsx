/** Chip nhỏ ghi vai trò của mình trong một nhà: chủ nhà dùng màu nhấn, thành viên dùng màu trung tính. */
export function RoleChip({ role }: { role: 'owner' | 'member' }) {
  const owner = role === 'owner'
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-[2px] text-[12px] font-semibold leading-snug ${
        owner ? 'border border-[rgba(232,131,58,0.45)] bg-[rgba(232,131,58,0.12)] text-accent-text' : 'border border-line2 bg-inner text-muted'
      }`}
    >
      {owner ? 'Chủ nhà' : 'Thành viên'}
    </span>
  )
}
