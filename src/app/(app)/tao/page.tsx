import { redirect } from 'next/navigation'
import { db } from '@/db'
import { daysInMonth } from '@/lib/billing/period-month'
import { AppError } from '@/lib/errors'
import { pickCreateMonth } from '@/lib/period-pick'
import { todayVn } from '@/lib/vn-time'
import { requireCurrentHouse } from '@/server/current-house'
import { listMyExpenses } from '@/server/expenses'
import { listAvatarSeeds, listMembers } from '@/server/houses'
import { getOrCreateDraftPeriod, getPeriodEditor, listPeriods, previewPeriod } from '@/server/periods'
import { periodParam } from '../_lib/period-data'
import { CreateForm } from './_ui/create-form'
import { MemberExpenseForm } from './_ui/member-expense-form'
import type { Preview } from './_ui/use-period-editor'

export const metadata = { title: 'Tạo mới' }

// Màn Tạo (nút "+"). Chủ nhà: hóa đơn tháng và khoản chi lẻ. Thành viên: chỉ khoản chi lẻ của chính mình (xem `MemberExpenseForm`).
// Nhà đã lưu trữ hoặc đã rời thì không có gì để tạo. Tháng của tab hóa đơn: `?ky=<id>` (sửa một tháng, kể cả đã chốt),
// không thì tháng tiêu thụ mặc định / nháp đang dở (`pickCreateMonth`); tháng đó chưa có thì tạo nháp khi mở.
// `?tab=chi-le` mở thẳng tab Khoản chi lẻ.
export default async function CreatePage({ searchParams }: PageProps<'/tao'>) {
  const { actor, current } = await requireCurrentHouse()
  if (current.archived || current.former) redirect('/')
  const sp = await searchParams
  const now = new Date()

  if (current.role !== 'owner') {
    const [members, seeds, mine] = await Promise.all([
      listMembers(db, actor, current.houseId),
      listAvatarSeeds(db, actor, current.houseId),
      listMyExpenses(db, actor, current.houseId),
    ])
    const me = members.find((m) => m.userId === actor.userId)
    if (!me) redirect('/')
    return (
      <MemberExpenseForm
        data={{
          houseId: current.houseId,
          today: todayVn(now),
          meId: me.id,
          payers: [{ id: me.id, name: me.displayName }],
          editPayers: [{ id: me.id, name: me.displayName }],
          participantChoices: members.map((m) => ({ id: m.id, name: m.displayName })),
          participantEditChoices: members.map((m) => ({ id: m.id, name: m.displayName })),
          seeds,
          expenses: mine.map((e) => ({ id: e.id, description: e.description, amount: e.amount, spentOn: e.spentOn, paidByMemberId: e.paidByMemberId, participantIds: e.participantIds })),
          listTitle: 'Khoản bạn đã thêm',
          month: null,
          closedMonth: false,
          uncountedIds: [],
          selfOnly: true,
        }}
      />
    )
  }

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
    <CreateForm
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
