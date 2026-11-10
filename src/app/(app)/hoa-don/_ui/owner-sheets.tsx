'use client'

import { useState } from 'react'
import { Sheet, sheetCtaClass } from '@/components/Sheet'
import { formatVnd } from '@/lib/money'
import { MoneyInput, inputClass, useSave } from '@/app/(app)/nha/_ui/settings-parts'
import { recordCashPaymentAction, recordRefundAction, rejectPaymentAction } from '../actions'

// Hai tấm nhập của chủ nhà ở màn Hóa đơn (không có mockup riêng, dùng kiểu tấm "Tạo mới"): lý do từ chối và số tiền
// ghi nhận (tiền mặt / đã trả lại). Server kiểm lại mọi điều kiện; ở đây chỉ chặn nhập sai thấy ngay.

const REASON_MAX = 200

function Footer({ error, busy, disabled, label, onSubmit }: { error: string | null; busy: boolean; disabled: boolean; label: string; onSubmit: () => void }) {
  return (
    <>
      {error && (
        <p role="alert" className="m-0 text-[13px] font-medium leading-snug text-unpaid-fg">
          {error}
        </p>
      )}
      <button type="button" disabled={busy || disabled} onClick={onSubmit} className={sheetCtaClass}>
        {busy ? 'Đang lưu…' : label}
      </button>
    </>
  )
}

export function RejectSheet({ paymentId, name, onClose }: { paymentId: string; name: string; onClose: () => void }) {
  const { busy, error, run } = useSave()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  async function submit() {
    if (await run(() => rejectPaymentAction(paymentId, trimmed))) onClose()
  }

  return (
    <Sheet
      title="Từ chối khoản chuyển"
      onClose={onClose}
      busy={busy}
      footer={<Footer error={error} busy={busy} disabled={trimmed.length === 0} label="Từ chối" onSubmit={submit} />}
    >
      <p className="m-0 text-[14px] leading-normal text-muted">
        {name} sẽ thấy lý do này và báo chuyển khoản lại được.
      </p>
      <label htmlFor="reject-reason" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
        Lý do
      </label>
      <textarea
        id="reject-reason"
        value={reason}
        maxLength={REASON_MAX}
        rows={3}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ví dụ: chưa thấy tiền về tài khoản"
        className={`${inputClass} h-auto resize-none py-3 leading-snug`}
      />
      <span className="text-right text-[12px] text-faint tabular-nums">
        {reason.length}/{REASON_MAX}
      </span>
    </Sheet>
  )
}

/** Ghi tiền mặt (kind='cash', tối đa bằng số còn thiếu) hoặc ghi chủ nhà đã trả lại (kind='refund', tối đa bằng số chủ nhà nợ). */
export function AmountSheet({
  kind,
  periodId,
  memberId,
  name,
  max,
  onClose,
}: {
  kind: 'cash' | 'refund'
  periodId: string
  memberId: string
  name: string
  max: number
  onClose: () => void
}) {
  const { busy, error, run } = useSave()
  const [amount, setAmount] = useState<number | null>(max)
  const cash = kind === 'cash'
  const valid = amount !== null && amount >= 1 && amount <= max

  async function submit() {
    if (amount === null) return
    const act = cash ? recordCashPaymentAction : recordRefundAction
    if (await run(() => act(periodId, memberId, amount))) onClose()
  }

  return (
    <Sheet
      title={cash ? 'Ghi tiền mặt' : 'Đã trả lại'}
      onClose={onClose}
      busy={busy}
      footer={
        <Footer
          error={error}
          busy={busy}
          disabled={!valid}
          label={cash ? 'Ghi đã nhận' : 'Ghi đã trả lại'}
          onSubmit={submit}
        />
      }
    >
      <p className="m-0 text-[14px] leading-normal text-muted">
        {cash ? `${name} còn thiếu ${formatVnd(max)} đ. Nhập số tiền mặt đã nhận.` : `Chủ nhà còn phải trả lại ${name} ${formatVnd(max)} đ. Nhập số đã trả.`}
      </p>
      <label htmlFor="amount" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
        Số tiền
      </label>
      <div className="flex">
        <MoneyInput id="amount" label="Số tiền" value={amount} onChange={setAmount} />
      </div>
      {amount !== null && amount > max && (
        <p role="alert" className="m-0 text-[13px] font-medium text-unpaid-fg">
          Tối đa {formatVnd(max)} đ
        </p>
      )}
    </Sheet>
  )
}
