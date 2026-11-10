import { daysInMonth } from './billing/period-month'
import type { ExpenseInput, FixedItem, PeriodInput, PeriodMember, Tariff, UtilityInput } from './billing/types'

// Màn Tạo hóa đơn giữ số liệu đang sửa dưới dạng `EditorState`, so với bản đã lưu để ra `PeriodEdits`
// (chỉ các trường đã đổi), và ráp vào bản chụp để tính thử tháng đã chốt ngay trên máy.

export type UtilityKey = 'electricity' | 'water'
export const UTILITY_KEYS: UtilityKey[] = ['electricity', 'water']

export type UtilitySnapshot = {
  mode: 'tiered' | 'total'
  prev: number | null
  curr: number | null
  total: number | null
  tariff: Tariff | null
}

/** `undefined` = giữ nguyên, `null` = xóa. */
export type UtilityPatch = { prev?: number | null; curr?: number | null; total?: number | null }

export type PeriodEdits = {
  utilities?: Partial<Record<UtilityKey, UtilityPatch>>
  members?: { memberId: string; days?: number; included?: boolean }[]
  items?: { itemId: string; enabled: boolean }[]
}

export type EditorSnapshot = {
  year: number
  month: number
  members: PeriodMember[]
  items: FixedItem[]
  utilities: Record<UtilityKey, UtilitySnapshot>
  expenses: ExpenseInput[]
}

export type EditorState = {
  utilities: Record<UtilityKey, { prev: number | null; curr: number | null; total: number | null }>
  members: Record<string, { days: number; included: boolean }>
  items: Record<string, boolean>
}

/** Đầu vào tính tiền của điện/nước: chưa nhập đủ (theo chế độ của tháng) → null. */
export function utilityInputOf(u: UtilitySnapshot | undefined): UtilityInput | null {
  if (!u) return null
  if (u.mode === 'total') return u.total === null ? null : { mode: 'total', total: u.total }
  if (u.prev === null || u.curr === null || !u.tariff) return null
  return { mode: 'tiered', prev: u.prev, curr: u.curr, tariff: u.tariff }
}

export function editorStateOf(s: EditorSnapshot): EditorState {
  const pick = (u: UtilitySnapshot) => ({ prev: u.prev, curr: u.curr, total: u.total })
  return {
    utilities: { electricity: pick(s.utilities.electricity), water: pick(s.utilities.water) },
    members: Object.fromEntries(s.members.map((m) => [m.memberId, { days: m.days, included: m.included }])),
    items: Object.fromEntries(s.items.map((i) => [i.id, i.enabled])),
  }
}

/** Các trường của `next` khác `base`; không có gì khác → null. */
export function diffEdits(base: EditorState, next: EditorState): PeriodEdits | null {
  const edits: PeriodEdits = {}
  for (const u of UTILITY_KEYS) {
    const patch: UtilityPatch = {}
    for (const f of ['prev', 'curr', 'total'] as const) {
      if (next.utilities[u][f] !== base.utilities[u][f]) patch[f] = next.utilities[u][f]
    }
    if (Object.keys(patch).length > 0) (edits.utilities ??= {})[u] = patch
  }
  for (const [memberId, m] of Object.entries(next.members)) {
    const b = base.members[memberId]
    if (!b) continue
    const e: { memberId: string; days?: number; included?: boolean } = { memberId }
    if (m.included !== b.included) e.included = m.included
    if (m.days !== b.days) e.days = m.days
    if (e.days !== undefined || e.included !== undefined) (edits.members ??= []).push(e)
  }
  for (const [itemId, enabled] of Object.entries(next.items)) {
    if (base.items[itemId] !== undefined && base.items[itemId] !== enabled) (edits.items ??= []).push({ itemId, enabled })
  }
  return Object.keys(edits).length > 0 ? edits : null
}

/** Bản chụp + số liệu đang sửa → đầu vào của `computePeriod` (cùng cách `previewPeriod` dựng từ DB). */
export function inputWithState(s: EditorSnapshot, state: EditorState): PeriodInput {
  const util = (u: UtilityKey) => utilityInputOf({ ...s.utilities[u], ...state.utilities[u] })
  return {
    year: s.year,
    month: s.month,
    daysInMonth: daysInMonth({ year: s.year, month: s.month }),
    members: s.members.map((m) => ({ ...m, ...(state.members[m.memberId] ?? {}) })),
    items: s.items.map((i) => ({ ...i, enabled: state.items[i.id] ?? i.enabled })),
    electricity: util('electricity'),
    water: util('water'),
    expenses: s.expenses,
  }
}
