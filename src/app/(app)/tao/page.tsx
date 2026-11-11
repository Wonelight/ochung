import { redirect } from 'next/navigation'
import { db } from '@/db'
import { daysInMonth } from '@/lib/billing/period-month'
import { AppError } from '@/lib/errors'
import { pickCreateMonth } from '@/lib/period-pick'
import { todayVn } from '@/lib/vn-time'
import { requireCurrentHouse } from '@/server/current-house'
import { listAvatarSeeds, listMembers } from '@/server/houses'
import { getOrCreateDraftPeriod, getPeriodEditor, listPeriods, previewPeriod } from '@/server/periods'
import { periodParam } from '../_lib/period-data'
import { CreateSheet } from './_ui/create-sheet'
import type { Preview } from './_ui/use-period-editor'

export const metadata = { title: 'Tạo mới' }

// Màn Tạo (nút "+"), chỉ chủ nhà của nhà đang dùng. Tháng của tab hóa đơn: `?ky=<id>` (sửa một tháng, kể cả đã chốt),
// không thì tháng tiêu thụ mặc định / nháp đang dở (`pickCreateMonth`); tháng đó chưa có thì tạo nháp khi mở.
// `?tab=chi-le` mở thẳng tab Khoản chi lẻ.
export default async function CreatePage({ searchParams }: PageProps<'/tao'>) {
  const { actor, current } = await requireCurrentHouse()
  if (current.role !== 'owner' || current.archived) redirect('/')
  const sp = await searchParams
  const now = new Date()

  const periods = await listPeriods(db, actor, current.houseId)
  const ky = periodParam(sp.ky)
  let periodId = ky && periods.some((p) => p.id === ky) ? ky : null
  if (!periodId) {
    const pick = pickCreateMonth(now, periods)
    periodId = pick.periodId ?? (await getOrCreateDraftPeriod(db, actor, current.houseId, pick.ym)).periodId
  }

  const [editor, members, seeds] = await Promise.all([
    getPeriodEditor(db, actor, periodId),
    listMembers(db, actor, current.houseId),
    listAvatarSeeds(db, actor, current.houseId),
  ])
  const { period } = editor
  const me = members.find((m) => m.userId === actor.userId)
  if (!me) redirect('/')
  const active = new Set(members.map((m) => m.id))

  let initialPreview: Preview = { result: null, problem: null }
  if (period.status === 'draft') {
    try {
      initialPreview = { result: await previewPeriod(db, actor, period.id), problem: null }
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      initialPreview = { result: null, problem: e.message }
    }
  }
  const next = period.month === 12 ? { year: period.year + 1, month: 1 } : { year: period.year, month: period.month + 1 }

  return (
    <CreateSheet
      key={period.id}
      initialTab={sp.tab === 'chi-le' ? 'expense' : 'bill'}
      data={{
        houseId: current.houseId,
        period: {
          id: period.id,
          year: period.year,
          month: period.month,
          status: period.status,
          daysInMonth: daysInMonth({ year: period.year, month: period.month }),
        },
        snapshot: {
          year: period.year,
          month: period.month,
          members: editor.members,
          items: editor.items,
          utilities: editor.utilities,
          expenses: editor.expenses,
        },
        initialPreview,
        leftIds: editor.members.filter((m) => !active.has(m.memberId)).map((m) => m.memberId),
        payers: members.map((m) => ({ id: m.id, name: m.displayName })),
        seeds,
        meId: me.id,
        today: todayVn(now),
        nextClosed: periods.some((p) => p.year === next.year && p.month === next.month && p.status === 'closed'),
      }}
    />
  )
}
