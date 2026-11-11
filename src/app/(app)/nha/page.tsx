import { redirect } from 'next/navigation'
import { db } from '@/db'
import { PageHeader } from '@/components/PageHeader'
import { requireCurrentHouse } from '@/server/current-house'
import { getHouseSettings } from '@/server/house-settings'
import { getHouse, listMembers } from '@/server/houses'
import { listInviteLinks, listJoinRequests } from '@/server/invites'
import { timeAgoVi } from '@/lib/time-ago'
import { AddByCode } from './_ui/add-by-code'
import { ArchiveHouseButton } from './_ui/archive-house-button'
import { BankSettings, DueDaySetting } from './_ui/bank-settings'
import { CopyCodeButton } from './_ui/copy-code-button'
import { FixedCharges } from './_ui/fixed-charges'
import { HouseNameEditor } from './_ui/house-name-editor'
import { InviteShare } from './_ui/invite-share'
import { JoinRequests } from './_ui/join-requests'
import { MemberQty } from './_ui/member-qty'
import { MembersList } from './_ui/members-list'
import { SettingsSection } from './_ui/settings-parts'
import { UtilitySettings } from './_ui/utility-settings'

export const metadata = { title: 'Quản lý nhà' }

// Màn Quản lý nhà theo mockup. Các khối "Chia sẻ link mời", "Chờ duyệt", "Thêm bằng mã tài khoản" chỉ chủ nhà
// của nhà đang dùng thấy (thành viên và nhà đã lưu trữ thì ẩn).
export default async function HouseManagePage() {
  const { actor, current } = await requireCurrentHouse()

  const [house, members] = await Promise.all([
    getHouse(db, actor, current.houseId),
    listMembers(db, actor, current.houseId),
  ])
  const me = members.find((m) => m.userId === actor.userId)
  if (!me) redirect('/')
  const isOwner = me.role === 'owner'
  const canManage = isOwner && !house.archived

  const now = new Date()
  const [links, requests] = canManage
    ? await Promise.all([listInviteLinks(db, actor, house.id), listJoinRequests(db, actor, house.id)])
    : [[], []]
  const settings = canManage ? await getHouseSettings(db, actor, house.id) : null
  const perUnitItems = settings?.items.filter((i) => i.kind === 'per_unit') ?? []
  const activeLinks = links
    .filter((l) => !l.revoked && l.expiresAt > now)
    .map((l) => ({ id: l.id, url: l.url, expiresAt: l.expiresAt.toISOString() }))

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
        {canManage && <InviteShare houseId={house.id} houseName={house.name} links={activeLinks} />}
      </section>

      {canManage && (
        <>
          <JoinRequests
            requests={requests.map((r) => ({
              id: r.id,
              name: r.displayName,
              avatarVariant: r.avatarVariant,
              note: `Nhập mã nhà · ${timeAgoVi(r.createdAt, now)}`,
            }))}
          />
          <AddByCode houseId={house.id} />
        </>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Thành viên · {members.length}
        </h2>
        <MembersList
          houseId={house.id}
          members={members.map((m) => ({ id: m.id, displayName: m.displayName, avatarVariant: m.avatarVariant, role: m.role }))}
          viewerMemberId={me.id}
          viewerIsOwner={isOwner}
          archived={house.archived}
        />
      </section>

      {settings && (
        <>
          <SettingsSection title="Khoản cố định" hint="Các khoản thu mỗi tháng như tiền nhà, internet, rác, tiền xe. Chạm vào một khoản để sửa.">
            <FixedCharges
              houseId={house.id}
              items={settings.items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, amount: i.amount }))}
            />
          </SettingsSection>

          {perUnitItems.length > 0 && (
            <SettingsSection title="Số lượng theo người" hint="Số lượng của từng người cho các khoản tính theo người, ví dụ số xe.">
              <MemberQty
                items={perUnitItems.map((i) => ({ id: i.id, name: i.name, amount: i.amount }))}
                members={members.map((m) => ({ id: m.id, displayName: m.displayName, avatarVariant: m.avatarVariant }))}
                qty={settings.qty}
              />
            </SettingsSection>
          )}

          <SettingsSection title="Điện" hint="Thay đổi chỉ áp dụng cho các tháng chưa chốt.">
            <UtilitySettings
              houseId={house.id}
              utility="electricity"
              title="Điện"
              unit="kWh"
              initialMode={settings.tariffs.electricity.mode}
              initialTariff={settings.tariffs.electricity.tariff}
            />
          </SettingsSection>

          <SettingsSection title="Nước" hint="Thay đổi chỉ áp dụng cho các tháng chưa chốt.">
            <UtilitySettings
              houseId={house.id}
              utility="water"
              title="Nước"
              unit="m³"
              initialMode={settings.tariffs.water.mode}
              initialTariff={settings.tariffs.water.tariff}
            />
          </SettingsSection>

          <SettingsSection title="Ngân hàng" hint="Dùng để tạo mã QR chuyển khoản cho thành viên.">
            <BankSettings
              houseId={house.id}
              bankBin={settings.bank.bankBin}
              accountNo={settings.bank.accountNo}
              accountName={settings.bank.accountName}
            />
          </SettingsSection>

          <SettingsSection title="Hạn đóng">
            <DueDaySetting houseId={house.id} dueDay={settings.dueDay} />
          </SettingsSection>
        </>
      )}

      {canManage && <ArchiveHouseButton houseId={house.id} houseName={house.name} />}
    </main>
  )
}
