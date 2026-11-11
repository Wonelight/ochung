'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { formatVnd } from '@/lib/money'
import { closePeriodAction, updateClosedPeriodAction } from '../actions'
import { ItemsPanel } from './items-panel'
import { MembersPanel } from './members-panel'
import { SheetFooter } from './sheet-footer'
import type { CreateData } from './types'
import type { usePeriodEditor } from './use-period-editor'
import { UtilityPanel } from './utility-panel'

const OFFLINE = 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại'

// Tab "Hóa đơn tháng N": điện, nước, công tắc khoản cố định, số ngày ở; chân tấm có tổng tháng, phần của chủ nhà
// và nút "Tạo & gửi hóa đơn" (tháng nháp) hoặc "Cập nhật" (sửa tháng đã chốt), đều qua hộp xác nhận.
export function BillTab({ data, editor }: { data: CreateData; editor: ReturnType<typeof usePeriodEditor> }) {
  const router = useRouter()
  const { period, snapshot } = data
  const closed = period.status === 'closed'
  const { state, update, preview, missing, pending, saveError, saving, save } = editor
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const result = preview.result
  const ownerSlip = result?.payslips.find((p) => p.due === null)
  const prevMonth = period.month === 1 ? 12 : period.month - 1
  const leftIds = new Set(data.leftIds)

  const message = saveError ?? preview.problem
  const disabled = !!message || !!missing || (closed && !pending)

  async function submit() {
    setBusy(true)
    setConfirmError(null)
    try {
      let res
      if (closed) {
        if (!pending) return setConfirm(false)
        res = await updateClosedPeriodAction(period.id, pending)
      } else {
        // chốt sổ đọc số liệu trong DB: phải lưu xong phần đang gõ trước
        if (!(await save())) return setConfirmError('Chưa lưu được số liệu vừa nhập, hãy sửa lỗi bên dưới rồi thử lại')
        res = await closePeriodAction(period.id)
      }
      if (!res.ok) return setConfirmError(res.message)
      router.push(`/hoa-don?ky=${period.id}`)
      router.refresh()
    } catch {
      setConfirmError(OFFLINE)
    } finally {
      setBusy(false)
    }
  }

  const utilityWarning =
    closed && data.nextClosed
      ? `Tháng ${period.month === 12 ? 1 : period.month + 1} đã chốt: đổi chỉ số mới ở đây không tự sửa chỉ số cũ của tháng đó.`
      : null

  return (
    <>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 pb-6 pt-3.5">
        {(['electricity', 'water'] as const).map((u) => (
          <UtilityPanel
            key={u}
            utility={u}
            snapshot={snapshot.utilities[u]}
            value={state.utilities[u]}
            onChange={(patch) => update((s) => ({ ...s, utilities: { ...s.utilities, [u]: { ...s.utilities[u], ...patch } } }))}
            amount={result ? (result[u]?.total ?? null) : null}
            prevMonth={prevMonth}
            warning={snapshot.utilities[u].mode === 'tiered' ? utilityWarning : null}
          />
        ))}
        <ItemsPanel
          items={snapshot.items}
          members={snapshot.members}
          enabled={state.items}
          included={Object.fromEntries(Object.entries(state.members).map(([id, m]) => [id, m.included]))}
          onToggle={(itemId, on) => update((s) => ({ ...s, items: { ...s.items, [itemId]: on } }))}
        />
        <MembersPanel
          members={snapshot.members}
          seeds={data.seeds}
          values={state.members}
          payslips={result?.payslips ?? null}
          leftIds={leftIds}
          daysInMonth={period.daysInMonth}
          month={period.month}
          onChange={(memberId, patch) => update((s) => ({ ...s, members: { ...s.members, [memberId]: { ...s.members[memberId], ...patch } } }))}
        />
      </div>

      <SheetFooter
        label={`Tổng tháng ${period.month}${saving ? ' · Đang lưu…' : ''}`}
        total={result ? result.grandTotal : null}
        rightLabel={ownerSlip ? 'Phần của bạn' : null}
        rightValue={ownerSlip ? ownerSlip.share : null}
        message={message}
        hint={missing}
        cta={closed ? 'Cập nhật' : 'Tạo & gửi hóa đơn'}
        disabled={disabled}
        onCta={() => {
          setConfirmError(null)
          setConfirm(true)
        }}
      />

      {confirm && (
        <ConfirmSheet
          tone="primary"
          title={closed ? `Cập nhật hóa đơn tháng ${period.month}?` : `Gửi hóa đơn tháng ${period.month}?`}
          body={
            closed
              ? 'Phiếu của cả nhà được tính lại theo số mới. Ai đã trả mà số tiền tăng lên sẽ chuyển sang "Còn thiếu".'
              : `Tổng ${result ? formatVnd(result.grandTotal) : '—'} đ. Cả nhà sẽ thấy phiếu và số tiền cần chuyển của mình. Bạn vẫn sửa được sau khi gửi.`
          }
          confirmLabel={closed ? 'Cập nhật' : 'Tạo & gửi'}
          pending={busy}
          error={confirmError}
          onConfirm={submit}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}
