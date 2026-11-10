import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { user } from '@/db/schema'
import { Avatar } from '@/components/Avatar'
import { getHouseContext } from '@/server/current-house'
import { listMyJoinRequests } from '@/server/invites'
import { CopyCodeButton } from '../nha/_ui/copy-code-button'
import { ArchivedHouses } from './_ui/archived-houses'
import { JoinCard } from './_ui/join-card'

export const metadata = { title: 'Vào nhà' }

// Màn Vào nhà theo mockup `Vào nhà`. Khác mockup: tên và mã tài khoản lấy từ tài khoản đang đăng nhập;
// thêm "Nhà cũ" (nhà đã lưu trữ, xem lại lịch sử) và nút "Tạo nhà mới" (mockup chưa có).
export default async function JoinHousePage() {
  const { actor, houses } = await getHouseContext()
  const [[profile], pending] = await Promise.all([
    db.select({ name: user.name, accountCode: user.accountCode }).from(user).where(eq(user.id, actor.userId)).limit(1),
    listMyJoinRequests(db, actor),
  ])
  const hasActiveHouse = houses.some((h) => !h.archived)
  const archived = houses.filter((h) => h.archived)

  return (
    <main className="flex flex-col gap-5 px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <Link href="/cai-dat" aria-label="Hồ sơ của bạn" className="flex size-11 shrink-0 rounded-[22px]">
          <Avatar seed={profile?.name ?? ''} size={44} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] text-muted">Xin chào, {profile?.name}</span>
          <span className="text-[17px] font-semibold">{hasActiveHouse ? 'Vào thêm nhà' : 'Chưa thuộc nhà nào'}</span>
        </div>
      </header>

      <JoinCard pending={pending} />

      <section className="flex items-start gap-3.5 rounded-[24px] border border-line bg-surface px-5 py-[18px]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-water-bg text-water-fg">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold">Có link mời?</span>
          <span className="text-[13px] leading-normal text-muted">
            Mở link chủ nhà gửi để vào thẳng, không cần chờ duyệt.
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2.5 rounded-[24px] border border-line bg-surface px-5 py-[18px]">
        <span className="text-[15px] font-semibold">Hoặc gửi mã tài khoản cho chủ nhà</span>
        <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-field py-1.5 pl-4 pr-1.5">
          <span className="flex-1 font-numeric text-[18px] font-semibold tracking-[0.08em]">{profile?.accountCode}</span>
          <CopyCodeButton code={profile?.accountCode ?? ''} label="mã tài khoản" radius={12} />
        </div>
      </section>

      {archived.length > 0 && <ArchivedHouses houses={archived.map((h) => ({ houseId: h.houseId, name: h.name }))} />}

      <Link
        href="/nha/moi"
        className="flex h-12 items-center justify-center rounded-[24px] border border-line2 bg-transparent text-[15px] font-semibold text-text no-underline"
      >
        Tạo nhà mới
      </Link>
    </main>
  )
}
