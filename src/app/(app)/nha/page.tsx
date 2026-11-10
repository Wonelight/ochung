import { redirect } from 'next/navigation'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { getHouseContext } from '@/server/current-house'
import { getHouse, listMembers } from '@/server/houses'
import { ArchiveHouseButton } from './_ui/archive-house-button'
import { CopyCodeButton } from './_ui/copy-code-button'
import { HouseNameEditor } from './_ui/house-name-editor'
import { MembersList } from './_ui/members-list'

export const metadata = { title: 'Quản lý nhà' }

// Màn Quản lý nhà theo mockup. Các khối "Chia sẻ link mời", "Chờ duyệt", "Thêm bằng mã tài khoản" (Task 9)
// sẽ chèn vào đúng chỗ đã đánh dấu; cùng khoảng cách gap-4 của cột.
export default async function HouseManagePage() {
  const { actor, current } = await getHouseContext()
  if (!current) return null // layout chuyển sang /nha/moi

  const [house, members] = await Promise.all([
    getHouse(db, actor, current.houseId),
    listMembers(db, actor, current.houseId),
  ])
  const me = members.find((m) => m.userId === actor.userId)
  if (!me) redirect('/')
  const isOwner = me.role === 'owner'
  const canManage = isOwner && !house.archived

  return (
    <main className="flex flex-col gap-4 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <PageHeader title="Quản lý nhà" backHref="/cai-dat" />

      <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] border border-line bg-card p-[18px]">
        <svg
          width="100%"
          height="64"
          viewBox="0 0 350 64"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute left-0 top-0 block"
        >
          <circle cx="300" cy="36" r="18" fill="#E8833A" style={{ fillOpacity: 'var(--c-sun-op)' }} />
          <path d="M0 50 Q110 30 210 46 T350 38 V64 H0Z" style={{ fill: 'var(--c-ridge)' }} />
        </svg>
        <div className="relative flex flex-col gap-0.5">
          <HouseNameEditor houseId={house.id} name={house.name} canEdit={canManage} />
          <span className="text-[13px] text-muted">
            {isOwner ? 'Bạn là chủ nhà' : 'Bạn là thành viên'} · {members.length} thành viên
            {house.archived ? ' · Đã lưu trữ, chỉ xem' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-[16px] bg-inner py-2.5 pl-3.5 pr-2.5">
          <div className="flex flex-1 flex-col">
            <span className="text-[12px] text-muted">Mã nhà</span>
            <span className="font-numeric text-[20px] font-semibold tracking-[0.12em]">{house.code}</span>
          </div>
          <CopyCodeButton code={house.code} />
        </div>
        {/* Task 9: nút "Chia sẻ link mời" và dòng giải thích đi ở đây (chỉ chủ nhà, nhà đang dùng) */}
      </section>

      {/* Task 9: khối "Chờ duyệt · N" (chủ nhà) */}
      {/* Task 9: khối "Thêm bằng mã tài khoản" (chủ nhà) */}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Thành viên · {members.length}
        </h2>
        <MembersList
          houseId={house.id}
          members={members.map((m) => ({ id: m.id, displayName: m.displayName, role: m.role }))}
          viewerMemberId={me.id}
          viewerIsOwner={isOwner}
          archived={house.archived}
        />
      </section>

      {canManage && <ArchiveHouseButton houseId={house.id} houseName={house.name} />}
    </main>
  )
}
