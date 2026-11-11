'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import type { ExpenseInput } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { dayMonth } from '@/lib/vn-time'
import { MoneyInput } from '../../nha/_ui/settings-parts'
import { addExpenseAction, deleteExpenseAction, updateExpenseAction } from '../actions'
import { SheetFooter } from './sheet-footer'
import type { CreateData } from './types'

// Tab "Khoản chi lẻ" (spec §6): số tiền, nội dung, ngày chi (mặc định hôm nay), "Ai đã trả" (mặc định là mình).
// Khoản chi tự vào tháng của ngày chi, tháng đó đã chốt thì sang tháng chưa chốt kế tiếp và báo "chi ngày 28/11, tính vào T12".
// Dưới form là các khoản chi của tháng đang làm hóa đơn, chạm để sửa hoặc xóa. Không có mockup riêng: dùng thẻ panel, ô nhập
// và chip của màn Tạo.

const OFFLINE = 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại'
const textInputClass =
  'box-border h-12 w-full min-w-0 rounded-[12px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none placeholder:text-faint focus:border-[1.5px] focus:border-accent focus:shadow-[0_0_0_4px_rgba(232,131,58,0.14)]'
const moneyClass = `${textInputClass} text-[17px] font-semibold tabular-nums`

type Form = { amount: number | null; description: string; spentOn: string; payer: string }

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

export function ExpenseTab({ data, onChanged }: { data: CreateData; onChanged: () => void }) {
  const router = useRouter()
  const { period, snapshot } = data
  const blank: Form = { amount: null, description: '', spentOn: data.today, payer: data.meId }
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState<ExpenseInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const names = new Map(snapshot.members.map((m) => [m.memberId, m.name]))
  // sửa: người trả phải có trong tháng của khoản chi; thêm: người đang ở nhà
  const people = editing ? snapshot.members.map((m) => ({ id: m.memberId, name: m.name })) : data.payers

  function startEdit(e: ExpenseInput) {
    setEditing(e)
    setForm({ amount: e.amount, description: e.description, spentOn: e.spentOn, payer: e.paidByMemberId })
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
    const input = { amount: form.amount, description: form.description, spentOn: form.spentOn, paidByMemberId: form.payer }
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
    const what = `Đã thêm “${input.description.trim()}”`
    setNotice(
      res.movedFromClosed
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

  return (
    <>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 pb-6 pt-3.5">
        <div className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-[var(--c-create-panel)] p-3.5">
          {editing && (
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold">Sửa khoản chi</h2>
              <button type="button" onClick={stopEdit} className="h-11 cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-[14px] font-semibold text-accent-text">
                Hủy
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="expense-amount" className="text-[12px] text-muted">
              Số tiền
            </label>
            <MoneyInput id="expense-amount" value={form.amount} onChange={(amount) => setForm((f) => ({ ...f, amount }))} placeholder="0" className={moneyClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="expense-desc" className="text-[12px] text-muted">
              Nội dung
            </label>
            <input
              id="expense-desc"
              type="text"
              maxLength={100}
              autoComplete="off"
              placeholder="Nước giặt, giấy vệ sinh, bóng đèn…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={textInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="expense-date" className="text-[12px] text-muted">
              Ngày chi
            </label>
            <input
              id="expense-date"
              type="date"
              required
              value={form.spentOn}
              onChange={(e) => setForm((f) => ({ ...f, spentOn: e.target.value || data.today }))}
              className={textInputClass}
            />
            {editing && (
              <span className="text-[12px] leading-snug text-muted">
                Đổi ngày chi không chuyển khoản này sang tháng khác. Muốn tính vào tháng khác, hãy xóa rồi thêm lại.
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Ai đã trả</span>
            <PayerChips people={people} seeds={data.seeds} value={form.payer} onChange={(payer) => setForm((f) => ({ ...f, payer }))} />
          </div>
          {editing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="flex h-11 cursor-pointer items-center justify-center rounded-[22px] border border-line2 bg-transparent font-[inherit] text-[14px] font-semibold text-unpaid-fg disabled:opacity-60"
            >
              Xóa khoản này
            </button>
          )}
        </div>

        {notice && (
          <p role="status" className="m-0 text-[13px] font-medium text-accent-text">
            {notice}
          </p>
        )}

        {snapshot.expenses.length > 0 && (
          <section className="mt-1.5 flex flex-col gap-2">
            <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Khoản chi tháng {period.month}</h2>
            <div className="flex flex-col rounded-[20px] border border-line bg-[var(--c-create-panel)] px-3.5 py-0.5">
              {snapshot.expenses.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => startEdit(e)}
                  aria-label={`Sửa khoản chi ${e.description}`}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 py-2 text-left font-[inherit] text-text ${
                    i < snapshot.expenses.length - 1 ? 'border-b border-solid border-line' : ''
                  } ${editing?.id === e.id ? 'opacity-60' : ''}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-medium">{e.description}</span>
                    <span className="text-[12px] text-muted">
                      {names.get(e.paidByMemberId) ?? '—'} trả · {dayMonth(e.spentOn)}
                    </span>
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
          body={`“${editing.description}” · ${formatVnd(editing.amount)} đ sẽ bị xóa khỏi tháng ${period.month}${
            period.status === 'closed' ? ', phiếu của cả nhà được tính lại' : ''
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
