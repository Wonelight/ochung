'use client'

import { useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { formatVnd } from '@/lib/money'
import { deleteChargeItemAction, reorderChargeItemsAction, saveChargeItemAction } from '../actions'
import {
  ErrorText,
  FieldLabel,
  MoneyInput,
  Segmented,
  formCardClass,
  ghostButtonClass,
  inputClass,
  listCardClass,
  primaryButtonClass,
  secondaryButtonClass,
  useSave,
} from './settings-parts'

export type ChargeItemData = { id: string; name: string; kind: 'equal' | 'per_unit'; amount: number }

type Draft = { id?: string; name: string; kind: 'equal' | 'per_unit'; amount: number | null }

const KIND_OPTIONS = [
  { value: 'equal' as const, label: 'Chia đều' },
  { value: 'per_unit' as const, label: 'Theo người' },
]

const describe = (i: ChargeItemData) =>
  i.kind === 'equal' ? `Chia đều · ${formatVnd(i.amount)}đ / tháng` : `Theo người · ${formatVnd(i.amount)}đ / đơn vị`

/**
 * "Khoản cố định": thêm, sửa, xóa, đổi thứ tự. "Chia đều" = tổng cả tháng chia cho mọi người;
 * "Theo người" = đơn giá nhân số lượng của từng người (ví dụ tiền xe), số lượng nhập ở mục kế bên.
 */
export function FixedCharges({ houseId, items }: { houseId: string; items: ChargeItemData[] }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ChargeItemData | null>(null)
  const save = useSave()
  const del = useSave()

  const open = (d: Draft) => {
    save.reset()
    setDraft(d)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (draft.amount === null) return save.setError('Hãy nhập số tiền')
    const res = await save.run(() =>
      saveChargeItemAction(houseId, { id: draft.id, name: draft.name, kind: draft.kind, amount: draft.amount ?? 0, active: true }),
    )
    if (res) setDraft(null)
  }

  async function move(index: number, by: -1 | 1) {
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    await save.run(() => reorderChargeItemsAction(houseId, ids))
  }

  async function onDelete() {
    if (!confirmDelete) return
    const res = await del.run(() => deleteChargeItemAction(confirmDelete.id))
    if (res) {
      setConfirmDelete(null)
      setDraft(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.length > 0 && (
        <div className={listCardClass}>
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex min-h-[60px] items-center gap-1"
              style={i < items.length - 1 ? { borderBottom: '1px solid var(--c-line)' } : undefined}
            >
              <button
                type="button"
                onClick={() => open({ id: item.id, name: item.name, kind: item.kind, amount: item.amount })}
                aria-label={`Sửa khoản ${item.name}`}
                className="flex min-h-[60px] min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 border-0 bg-transparent p-0 text-left font-[inherit] text-text"
              >
                <span className="truncate text-[15px] font-semibold">{item.name}</span>
                <span className="text-[12px] text-muted">{describe(item)}</span>
              </button>
              {items.length > 1 && (
                <>
                  <MoveButton label={`Đưa ${item.name} lên`} disabled={i === 0 || save.busy} onClick={() => move(i, -1)} up />
                  <MoveButton label={`Đưa ${item.name} xuống`} disabled={i === items.length - 1 || save.busy} onClick={() => move(i, 1)} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {items.length === 0 && !draft && (
        <p className="m-0 rounded-[20px] border border-line bg-surface px-3.5 py-4 text-[14px] text-muted">
          Chưa có khoản nào. Thêm tiền nhà, phí dịch vụ, internet, rác, tiền xe…
        </p>
      )}

      {draft ? (
        <form onSubmit={onSubmit} className={formCardClass}>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="item-name">Tên khoản</FieldLabel>
            <input
              id="item-name"
              type="text"
              value={draft.name}
              maxLength={60}
              autoComplete="off"
              autoFocus
              placeholder="VD: Tiền nhà"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>Cách chia</FieldLabel>
            <Segmented label="Cách chia" value={draft.kind} options={KIND_OPTIONS} onChange={(kind) => setDraft({ ...draft, kind })} />
            <span className="text-[12px] leading-snug text-muted">
              {draft.kind === 'equal'
                ? 'Số tiền cả tháng, chia đều cho mọi thành viên được tính.'
                : 'Đơn giá cho mỗi đơn vị (ví dụ mỗi xe). Số lượng của từng người nhập ở mục bên dưới.'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="item-amount">{draft.kind === 'equal' ? 'Số tiền cả tháng' : 'Đơn giá'}</FieldLabel>
            <div className="flex">
              <MoneyInput id="item-amount" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} placeholder="0" />
            </div>
          </div>
          <ErrorText>{save.error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={save.busy} className={primaryButtonClass}>
              {save.busy ? 'Đang lưu…' : 'Lưu'}
            </button>
            <button type="button" disabled={save.busy} onClick={() => setDraft(null)} className={ghostButtonClass}>
              Hủy
            </button>
            {draft.id && (
              <button
                type="button"
                disabled={save.busy}
                onClick={() => {
                  const item = items.find((i) => i.id === draft.id)
                  if (item) {
                    del.reset()
                    setConfirmDelete(item)
                  }
                }}
                className={`${ghostButtonClass} ml-auto text-unpaid-fg`}
              >
                Xóa
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <ErrorText>{save.error}</ErrorText>
          <button type="button" onClick={() => open({ name: '', kind: 'equal', amount: null })} className={`${secondaryButtonClass} h-[50px] w-full`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Thêm khoản
          </button>
        </>
      )}

      {confirmDelete && (
        <ConfirmSheet
          title={`Xóa khoản "${confirmDelete.name}"?`}
          body="Khoản sẽ không còn trong các tháng mới. Các tháng đã chốt giữ nguyên số liệu."
          confirmLabel="Xóa khoản"
          pending={del.busy}
          error={del.error}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

function MoveButton({ label, disabled, onClick, up }: { label: string; disabled: boolean; onClick: () => void; up?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[22px] border-0 bg-transparent p-0 text-muted disabled:cursor-default disabled:opacity-30"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
      </svg>
    </button>
  )
}
