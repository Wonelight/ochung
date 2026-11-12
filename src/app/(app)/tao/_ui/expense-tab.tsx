'use client'

import { useRouter } from 'next/navigation'
import { useState, type FocusEvent } from 'react'
import { Avatar } from '@/components/Avatar'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import type { ExpenseInput } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { dayMonth } from '@/lib/vn-time'
import { MoneyInput } from '../../nha/_ui/settings-parts'
import { addExpenseAction, deleteExpenseAction, updateExpenseAction } from '../actions'
import { SheetFooter } from './sheet-footer'
import type { ExpenseTabData } from './types'

// Tab "Khoản chi lẻ" (spec §6): ngày chi (mặc định hôm nay, có mũi tên ‹ ›), nội dung, số tiền (nút cộng nhanh), "Ai đã trả"
// (mặc định là mình) và lưới ô gợi ý nội dung bấm một lần là điền. Mỗi mục là một hàng nhãn trái + ô nhập phải.
// Khoản chi tự vào tháng của ngày chi, tháng đó đã chốt thì sang tháng chưa chốt kế tiếp và báo "chi ngày 28/11, tính vào T12".
// Dưới form là các khoản chi của tháng đang làm hóa đơn, chạm để sửa hoặc xóa. Không có mockup riêng: dùng thẻ panel, ô nhập
// và chip của màn Tạo.

const OFFLINE = 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại'

/** `participants`: những người cùng chịu khoản chi; null = cả nhà. */
type Form = { amount: number | null; description: string; spentOn: string; payer: string; participants: string[] | null }

const WEEKDAY = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']
const rowClass = 'flex min-h-14 items-center gap-3 border-b border-line px-3.5 py-2 last:border-b-0'
const rowLabelClass = 'w-[72px] shrink-0 text-[14px] font-semibold'
const stepBtnClass =
  'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line2 bg-transparent p-0 text-text disabled:cursor-default disabled:opacity-40'

/** "2026-11-11" → "Th 4, 11/11" (cùng năm với hôm nay) hoặc "Th 4, 11/11/2025". Tính theo UTC để không lệch ngày theo múi giờ của máy. */
function formatDay(ymd: string, today: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const dm = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  return `${WEEKDAY[dow]}, ${y === Number(today.slice(0, 4)) ? dm : `${dm}/${y}`}`
}

function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

const QUICK_AMOUNTS = [10_000, 50_000, 100_000, 500_000]

// Ô gợi ý nội dung (biểu tượng nét như phần còn lại của app). Chạm là điền vào ô "Nội dung", vẫn sửa được.
const TILES: { label: string; color: string; paths: string[] }[] = [
  { label: 'Nước giặt', color: '#3B82F6', paths: ['M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z'] },
  { label: 'Đồ vệ sinh', color: '#10B981', paths: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z', 'M20 3v4', 'M22 5h-4'] },
  { label: 'Đồ dùng chung', color: '#EC4899', paths: ['M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12', 'M8 21h.01', 'M19 21h.01'] },
  { label: 'Nước lọc', color: '#0EA5E9', paths: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'] },
  { label: 'Bóng đèn', color: '#F59E0B', paths: ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'] },
  { label: 'Sửa chữa', color: '#8B5CF6', paths: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'] },
  { label: 'Gas', color: '#EF4444', paths: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'] },
  { label: 'Internet', color: '#E8833A', paths: ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'] },
]

function PayerChips({
  people,
  seeds,
  value,
  onChange,
}: {
  people: { id: string; name: string }[]
  seeds: Record<string, string>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div role="radiogroup" aria-label="Ai đã trả" className="flex flex-wrap gap-2">
      {people.map((p) => {
        const on = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={p.name}
            onClick={() => onChange(p.id)}
            className={`flex h-11 cursor-pointer items-center gap-2 rounded-[22px] border-0 pl-1.5 pr-3.5 font-[inherit] text-[14px] font-semibold ${
              on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1.5px_#E8833A]' : 'bg-transparent text-muted shadow-[inset_0_0_0_1px_var(--c-line2)]'
            }`}
          >
            <Avatar seed={seeds[p.id] ?? p.name} size={32} />
            {p.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "Chia cho": mặc định cả nhà (một dòng, không tốn thao tác). Bấm "Chọn" để chọn riêng từng người: mọi chip đang bật thì chạm
 * một chip là bỏ người đó ra; chọn lại đủ mọi người thì quay về "Cả nhà" (null) để người vào nhà sau vẫn được chia.
 * Luôn giữ ít nhất một người.
 */
function ParticipantsRow({
  people,
  seeds,
  value,
  onChange,
}: {
  people: { id: string; name: string }[]
  seeds: Record<string, string>
  value: string[] | null
  onChange: (v: string[] | null) => void
}) {
  const [open, setOpen] = useState(value !== null)
  const picked = value ?? people.map((p) => p.id)
  const summary = value === null ? 'Cả nhà' : people.filter((p) => value.includes(p.id)).map((p) => p.name).join(', ') || 'Chưa chọn ai'

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    if (next.length === 0) return
    onChange(people.every((p) => next.includes(p.id)) ? null : next)
  }

  return (
    <div className="flex flex-col gap-2 border-b border-line px-3.5 py-2.5">
      <div className="flex min-h-11 items-center gap-3">
        <span className={rowLabelClass}>Chia cho</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{summary}</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="h-11 shrink-0 cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-[14px] font-semibold text-accent-text"
        >
          {open ? 'Xong' : 'Chọn'}
        </button>
      </div>
      {open && (
        <div role="group" aria-label="Chia cho" className="flex flex-wrap gap-2 pl-[84px]">
          {people.map((p) => {
            const on = picked.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(p.id)}
                className={`flex h-11 cursor-pointer items-center gap-2 rounded-[22px] border-0 pl-1.5 pr-3.5 font-[inherit] text-[14px] font-semibold ${
                  on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1.5px_#E8833A]' : 'bg-transparent text-muted shadow-[inset_0_0_0_1px_var(--c-line2)]'
                }`}
              >
                <span className={on ? '' : 'opacity-50'}>
                  <Avatar seed={seeds[p.id] ?? p.name} size={32} />
                </span>
                {p.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ExpenseTab({ data, onChanged }: { data: ExpenseTabData; onChanged: () => void }) {
  const router = useRouter()
  const blank: Form = { amount: null, description: '', spentOn: data.today, payer: data.meId, participants: null }
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState<ExpenseInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** Tăng sau mỗi lần thêm xong để ô "Chia cho" được dựng lại (đóng, về "Cả nhà"). */
  const [formEpoch, setFormEpoch] = useState(0)
  const names = new Map([...data.payers, ...data.editPayers, ...data.participantChoices, ...data.participantEditChoices].map((p) => [p.id, p.name]))
  // sửa: người trả phải có trong tháng của khoản chi; thêm: người đang ở nhà
  const people = editing ? data.editPayers : data.payers

  function startEdit(e: ExpenseInput) {
    setEditing(e)
    setForm({ amount: e.amount, description: e.description, spentOn: e.spentOn, payer: e.paidByMemberId, participants: e.participantIds ?? null })
    setError(null)
    setNotice(null)
  }

  function stopEdit() {
    setEditing(null)
    setForm(blank)
    setError(null)
  }

  async function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>): Promise<T | null> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fn()
      if (!res.ok) {
        setError(res.message)
        return null
      }
      router.refresh()
      onChanged()
      return res.data
    } catch {
      setError(OFFLINE)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (form.amount === null || form.amount <= 0) return setError('Hãy nhập số tiền')
    if (form.description.trim() === '') return setError('Hãy nhập nội dung khoản chi')
    const input = { amount: form.amount, description: form.description, spentOn: form.spentOn, paidByMemberId: form.payer, participantIds: form.participants }
    if (editing) {
      const ok = await run(() => updateExpenseAction(editing.id, input))
      if (ok !== null) {
        stopEdit()
        setNotice('Đã lưu thay đổi')
      }
      return
    }
    const res = await run(() => addExpenseAction(data.houseId, input))
    if (!res) return
    setForm(blank)
    setFormEpoch((n) => n + 1)
    const what = `Đã thêm “${input.description.trim()}”`
    setNotice(
      data.selfOnly
        ? `${what}. Chủ nhà sẽ tính vào hóa đơn tháng ${res.ym.month}/${res.ym.year}`
        : res.movedFromClosed
          ? `${what}: chi ngày ${dayMonth(input.spentOn)}, tính vào T${res.ym.month}`
          : `${what} vào tháng ${res.ym.month}/${res.ym.year}`,
    )
  }

  async function remove() {
    if (!editing) return
    const ok = await run(() => deleteExpenseAction(editing.id))
    setConfirmDelete(false)
    if (ok !== null) {
      stopEdit()
      setNotice('Đã xóa khoản chi')
    }
  }

  // Gõ vào ô nào thì kéo ô đó lên khỏi chân trang dính đáy (ô nhập có `scroll-mb-32` chừa chỗ cho chân trang), không để bàn phím che mất.
  function keepVisible(e: FocusEvent<HTMLDivElement>) {
    const el = e.target
    if (el instanceof HTMLInputElement && el.type !== 'date') setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250)
  }

  function pickTile(label: string) {
    setForm((f) => ({ ...f, description: label }))
    // chọn gợi ý xong chỉ còn thiếu số tiền: đưa con trỏ tới đó
    requestAnimationFrame(() => document.getElementById('expense-amount')?.focus())
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-6 pt-3.5">
        <section aria-label="Gợi ý nhanh" className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Gợi ý nhanh</h2>
          <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TILES.map((t) => {
              const on = form.description.trim() === t.label
              return (
                <button
                  key={t.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickTile(t.label)}
                  className={`flex h-11 shrink-0 cursor-pointer snap-start items-center gap-2 whitespace-nowrap rounded-[22px] border bg-[var(--c-create-panel)] pl-3 pr-3.5 font-[inherit] text-[14px] font-medium text-text ${
                    on ? 'border-accent shadow-[0_0_0_1.5px_#E8833A]' : 'border-line'
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {t.paths.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                  {t.label}
                </button>
              )
            })}
          </div>
        </section>

        <div onFocus={keepVisible} className="flex flex-col rounded-[20px] border border-line bg-[var(--c-create-panel)]">
          {editing && (
            <div className="flex items-center justify-between gap-3 border-b border-line px-3.5">
              <h2 className="m-0 text-[15px] font-semibold">Sửa khoản chi</h2>
              <button type="button" onClick={stopEdit} className="h-11 cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-[14px] font-semibold text-accent-text">
                Hủy
              </button>
            </div>
          )}

          <div className={rowClass}>
            <label htmlFor="expense-desc" className={rowLabelClass}>
              Nội dung
            </label>
            <input
              id="expense-desc"
              type="text"
              maxLength={100}
              autoComplete="off"
              placeholder="Chưa nhập vào"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="box-border h-11 min-w-0 flex-1 scroll-mb-32 rounded-[12px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none placeholder:text-faint focus:border-[1.5px] focus:border-accent focus:shadow-[0_0_0_4px_rgba(232,131,58,0.14)]"
            />
          </div>

          <div className="flex flex-col gap-2 border-b border-line px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              <label htmlFor="expense-amount" className={rowLabelClass}>
                Số tiền
              </label>
              <MoneyInput
                id="expense-amount"
                value={form.amount}
                onChange={(amount) => setForm((f) => ({ ...f, amount }))}
                placeholder="0"
                className="box-border h-12 min-w-0 flex-1 scroll-mb-32 rounded-[12px] border border-line2 bg-input px-3.5 font-[inherit] text-[22px] font-semibold tabular-nums text-text outline-none placeholder:text-faint focus:border-[1.5px] focus:border-accent focus:shadow-[0_0_0_4px_rgba(232,131,58,0.14)]"
              />
            </div>
            <div className="flex gap-2 pl-[84px]">
              {QUICK_AMOUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Cộng ${formatVnd(n)} đồng`}
                  onClick={() => setForm((f) => ({ ...f, amount: (f.amount ?? 0) + n }))}
                  className="h-9 min-w-0 flex-1 cursor-pointer rounded-[18px] border border-line2 bg-transparent p-0 font-[inherit] text-[13px] font-semibold text-text"
                >
                  +{n / 1000}k
                </button>
              ))}
            </div>
          </div>

          {!data.selfOnly && (
            <div className={rowClass}>
              <span className={rowLabelClass}>Ai đã trả</span>
              <div className="min-w-0 flex-1">
                <PayerChips people={people} seeds={data.seeds} value={form.payer} onChange={(payer) => setForm((f) => ({ ...f, payer }))} />
              </div>
            </div>
          )}

          <ParticipantsRow
            // đổi sang khoản khác (hoặc thoát chế độ sửa) thì dựng lại, để trạng thái mở/đóng theo khoản đó
            key={`${editing?.id ?? 'new'}-${formEpoch}`}
            people={editing ? data.participantEditChoices : data.participantChoices}
            seeds={data.seeds}
            value={form.participants}
            onChange={(participants) => setForm((f) => ({ ...f, participants }))}
          />

          <div className={rowClass}>
            <label htmlFor="expense-date" className={rowLabelClass}>
              Ngày chi
            </label>
            <button type="button" aria-label="Ngày trước" onClick={() => setForm((f) => ({ ...f, spentOn: shiftDay(f.spentOn, -1) }))} className={stepBtnClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="relative flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[12px] border border-line2 bg-input text-[15px] font-semibold tabular-nums">
              {formatDay(form.spentOn, data.today)}
              <input
                id="expense-date"
                type="date"
                required
                max={data.selfOnly ? data.today : undefined}
                value={form.spentOn}
                onChange={(e) => setForm((f) => ({ ...f, spentOn: e.target.value || data.today }))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <button type="button" aria-label="Ngày sau" disabled={data.selfOnly && form.spentOn >= data.today} onClick={() => setForm((f) => ({ ...f, spentOn: shiftDay(f.spentOn, 1) }))} className={stepBtnClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          {editing && (
            <p className="m-0 border-b border-line px-3.5 py-2 text-[12px] leading-snug text-muted">
              Đổi ngày chi không chuyển khoản này sang tháng khác. Muốn tính vào tháng khác, hãy xóa rồi thêm lại.
            </p>
          )}

          {editing && (
            <div className="px-3.5 pb-3.5 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[22px] border border-line2 bg-transparent font-[inherit] text-[14px] font-semibold text-unpaid-fg disabled:opacity-60"
              >
                Xóa khoản này
              </button>
            </div>
          )}
        </div>

        {notice && (
          <p role="status" className="m-0 text-[13px] font-medium text-accent-text">
            {notice}
          </p>
        )}

        {data.expenses.length > 0 && (
          <section className="mt-1.5 flex flex-col gap-2">
            <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{data.listTitle}</h2>
            <div className="flex flex-col rounded-[20px] border border-line bg-[var(--c-create-panel)] px-3.5 py-0.5">
              {data.expenses.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => startEdit(e)}
                  aria-label={`Sửa khoản chi ${e.description}`}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 py-2 text-left font-[inherit] text-text ${
                    i < data.expenses.length - 1 ? 'border-b border-solid border-line' : ''
                  } ${editing?.id === e.id ? 'opacity-60' : ''}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-medium">{e.description}</span>
                    <span className="text-[12px] text-muted">
                      {names.get(e.paidByMemberId) ?? '—'} trả · {dayMonth(e.spentOn)}
                      {e.participantIds && ` · chia cho ${e.participantIds.map((id) => names.get(id) ?? '—').join(', ')}`}
                    </span>
                    {e.participantIds?.some((id) => data.uncountedIds.includes(id)) && (
                      <span className="text-[12px] text-unpaid-fg">Có người không được tính tháng này, khoản chi chỉ chia cho những người còn lại</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatVnd(e.amount)} đ</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <SheetFooter
        label={editing ? 'Sửa khoản chi' : 'Khoản chi lẻ'}
        total={form.amount}
        rightLabel={null}
        rightValue={null}
        message={error}
        cta={editing ? 'Lưu thay đổi' : 'Thêm khoản chi'}
        disabled={false}
        busy={busy}
        onCta={submit}
      />

      {confirmDelete && editing && (
        <ConfirmSheet
          title="Xóa khoản chi này?"
          body={`“${editing.description}” · ${formatVnd(editing.amount)} đ sẽ bị xóa${data.month === null ? '' : ` khỏi tháng ${data.month}`}${
            data.closedMonth ? ', phiếu của cả nhà được tính lại' : ''
          }.`}
          confirmLabel="Xóa"
          pending={busy}
          error={error}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
