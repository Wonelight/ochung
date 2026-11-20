import { redirect } from 'next/navigation'
import { db } from '@/db'
import { currentMonthVn, daysInMonth } from '@/lib/billing/period-month'
import { AppError } from '@/lib/errors'
import type { YM } from '@/lib/billing/types'
import { expenseParam } from '@/lib/ledger-edit'
import { createMonthNav, parseMonthParam, parseStartMonth, pickCreateMonth, startMonthParam } from '@/lib/period-pick'
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
// Nhà đã lưu trữ hoặc đã rời thì không có gì để tạo. Tháng của tab hóa đơn: `?period=<id>` (sửa một tháng, kể cả đã chốt),
// không thì tháng tiêu thụ mặc định / nháp đang dở (`pickCreateMonth`); tháng đó chưa có thì tạo nháp khi mở.
// `?tab=expense` mở thẳng tab Khoản chi lẻ; `?expense=<id>` mở thẳng form sửa khoản chi đó (link từ bảng Chi tiêu tháng).
export default async function CreatePage({ searchParams }: PageProps<'/create'>) {
  const { actor, current } = await requireCurrentHouse()
  if (current.archived || current.former) redirect('/')
  const sp = await searchParams
  const now = new Date()
  const editId = expenseParam(sp.expense)

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
        initialEditId={editId}
      />
    )
  }

  const periods = await listPeriods(db, actor, current.houseId)
  const ky = periodParam(sp.period ?? sp.ky) // `ky`: tham số cũ, link/thông báo đã gửi trước đây vẫn mở được
  let periodId = ky && periods.some((p) => p.id === ky) ? ky : null
  // `?month=YYYY-MM`: chủ nhà tự chọn tháng bằng mũi tên ở đầu màn. Có kỳ rồi (nháp hay đã chốt) thì mở kỳ đó, chưa có thì tạo nháp.
  const picked = periodId ? null : parseMonthParam(Array.isArray(sp.month) ? sp.month[0] : sp.month, now, periods)
  if (picked) {
    const existing = periods.find((p) => p.year === picked.year && p.month === picked.month)
    periodId = existing?.id ?? (await getOrCreateDraftPeriod(db, actor, current.houseId, picked)).periodId
  }
  if (!periodId) {
    if (periods.length === 0) {
      // Nhà chưa có hóa đơn nào: kỳ đầu tiên do chủ nhà chọn (`?start=`, chọn ở trang chủ). Không có lựa chọn thì về trang chủ
      // để chọn, thay vì tự tạo nháp tháng liền trước rồi kẹt không bỏ được. Tab Khoản chi lẻ thì chi ghi vào tháng hiện tại.
      const start = parseStartMonth(Array.isArray(sp.start) ? sp.start[0] : sp.start, now)
      const ym = start ?? (sp.tab === 'expense' || sp.tab === 'chi-le' ? currentMonthVn(now) : null)
      if (!ym) redirect('/')
      periodId = (await getOrCreateDraftPeriod(db, actor, current.houseId, ym)).periodId
    } else {
      const pick = pickCreateMonth(now, periods)
      periodId = pick.periodId ?? (await getOrCreateDraftPeriod(db, actor, current.houseId, pick.ym)).periodId
    }
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
  const nav = createMonthNav({ year: period.year, month: period.month }, now, periods)
  const monthHref = (ym: YM | null) => (ym ? `/create?month=${startMonthParam(ym)}` : null)

  return (
    <CreateForm
      key={period.id}
      initialTab={editId || sp.tab === 'expense' || sp.tab === 'chi-le' ? 'expense' : 'bill'}
      initialEditId={editId}
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
        monthNav: { olderHref: monthHref(nav.older), newerHref: monthHref(nav.newer) },
        nextClosed: periods.some((p) => p.year === next.year && p.month === next.month && p.status === 'closed'),
      }}
    />
  )
}
