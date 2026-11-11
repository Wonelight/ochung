import Link from 'next/link'
import { db } from '@/db'
import { InstallGuide } from '@/components/InstallGuide'
import { PushToggle } from '@/components/PushToggle'
import { todayVn } from '@/lib/vn-time'
import { readOwnProfile } from '@/server/account'
import { getHouseContext } from '@/server/current-house'
import { listJoinRequests } from '@/server/invites'
import { PasskeyManager } from './_ui/passkey-manager'
import { ProfileEditor } from './_ui/profile-editor'
import { SignOutButton } from './_ui/sign-out-button'
import { ThemePicker } from './_ui/theme-picker'

export const metadata = { title: 'Cài đặt' }

const rowClass =
  'flex min-h-14 items-center gap-3 border-b border-line text-text no-underline last:border-b-0'
const chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-faint">
    <path d="m9 18 6-6-6-6" />
  </svg>
)
const rowIcon = (children: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
)

// Màn Cài đặt theo mockup `Cài đặt`. Thêm theo spec §10 và Task 15: sao chép mã tài khoản, công tắc thông báo + hướng dẫn
// "Thêm vào Màn hình chính", Giao diện (Tự động/Sáng/Tối), Face ID, và (quản trị viên) lối vào /admin.
export default async function SettingsPage() {
  const { actor, current } = await getHouseContext()
  const profile = await readOwnProfile(db, actor)
  const pending =
    current && current.role === 'owner' && !current.archived ? (await listJoinRequests(db, actor, current.houseId)).length : 0
  const subtitle = current
    ? `${current.former ? 'Đã rời' : current.role === 'owner' ? 'Chủ nhà' : 'Thành viên'} · ${current.name}`
    : 'Chưa thuộc nhà nào'

  return (
    <main className="flex flex-col gap-[18px] px-5 pb-[calc(140px+env(safe-area-inset-bottom))] pt-[max(58px,env(safe-area-inset-top))]">
      <h1 className="m-0 font-numeric text-[22px] font-semibold uppercase tracking-[0.12em]">Cài đặt</h1>

      <ProfileEditor
        initialName={profile.name}
        initialDob={profile.dob ?? ''}
        initialVariant={profile.avatarVariant}
        accountCode={profile.accountCode}
        subtitle={subtitle}
        today={todayVn(new Date())}
      />

      <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5">
        {current && !current.former && (
          <Link href="/nha" className={rowClass}>
            {rowIcon(
              <>
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
              </>,
            )}
            <span className="flex-1 text-[15px] font-medium">Quản lý nhà</span>
            {pending > 0 && (
              <span className="rounded-full bg-unpaid-bg px-2 py-[3px] text-[12px] font-semibold text-unpaid-fg">{pending} chờ duyệt</span>
            )}
            {chevron}
          </Link>
        )}
        <Link href="/vao-nha" className={rowClass}>
          {rowIcon(
            <>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </>,
          )}
          <span className="flex-1 text-[15px] font-medium">Vào nhà khác</span>
          {chevron}
        </Link>
        <Link href="/doi-mat-khau" className={rowClass}>
          {rowIcon(
            <>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </>,
          )}
          <span className="flex-1 text-[15px] font-medium">Đổi mật khẩu</span>
          {chevron}
        </Link>
        {actor.role === 'admin' && (
          <Link href="/admin" className={rowClass}>
            {rowIcon(
              <>
                <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z" />
                <path d="m9 12 2 2 4-4" />
              </>,
            )}
            <span className="flex-1 text-[15px] font-medium">Quản trị tài khoản</span>
            {chevron}
          </Link>
        )}
      </section>

      <ThemePicker />
      <PushToggle />
      <InstallGuide />
      <PasskeyManager userId={actor.userId} />
      <SignOutButton />
    </main>
  )
}
