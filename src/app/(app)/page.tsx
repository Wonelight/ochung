import { db } from '@/db'
import { Avatar } from '@/components/Avatar'
import { HouseSwitcher } from '@/components/HouseSwitcher'
import { requireCurrentHouse } from '@/server/current-house'
import { listMembers } from '@/server/houses'

// Tạm thời: tên nhà (có đổi nhà) và danh sách thành viên. Task 12 thay bằng Trang chủ theo mockup.
export default async function Home() {
  const { actor, current } = await requireCurrentHouse()
  const members = await listMembers(db, actor, current.houseId)
  return (
    <main className="flex flex-col gap-[18px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <HouseSwitcher />
      <ul className="m-0 flex list-none flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
        {members.map((m, i) => (
          <li
            key={m.id}
            className="flex min-h-[60px] items-center gap-3"
            style={i < members.length - 1 ? { borderBottom: '1px solid var(--c-line)' } : undefined}
          >
            <Avatar seed={m.displayName} size={40} />
            <span className="text-[15px] font-semibold">{m.displayName}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
