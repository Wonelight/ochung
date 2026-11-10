'use client'

import { useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { archiveHouseAction } from '../actions'

/**
 * "Xóa nhà" thực chất là lưu trữ: nhà biến khỏi danh sách đang dùng, mọi người vẫn xem lại lịch sử.
 * Bước 1 giải thích; nếu còn tháng đã chốt chưa thu đủ, server từ chối và bước 2 hỏi xác nhận lần nữa.
 */
export function ArchiveHouseButton({ houseId, houseName }: { houseId: string; houseName: string }) {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [warning, setWarning] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setStep(0)
    setError(null)
  }

  async function run(force: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await archiveHouseAction(houseId, force)
      if (!res.ok) return setError(res.message)
      if (!res.data.archived) {
        setWarning(res.data.warning)
        return setStep(2)
      }
      setStep(0)
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStep(1)}
        className="h-[50px] cursor-pointer rounded-[25px] border border-line2 bg-transparent font-[inherit] text-[15px] font-semibold text-unpaid-fg"
      >
        Xóa nhà
      </button>
      {step === 1 && (
        <ConfirmSheet
          title={`Xóa ${houseName}?`}
          body="Nhà sẽ được lưu trữ: biến khỏi danh sách nhà đang dùng, không ai sửa được nữa. Mọi người vẫn xem lại được lịch sử các tháng."
          confirmLabel="Xóa nhà"
          pending={busy}
          error={error}
          onConfirm={() => run(false)}
          onCancel={close}
        />
      )}
      {step === 2 && (
        <ConfirmSheet
          title="Vẫn xóa nhà?"
          body={warning}
          confirmLabel="Vẫn xóa nhà"
          pending={busy}
          error={error}
          onConfirm={() => run(true)}
          onCancel={close}
        />
      )}
    </>
  )
}
