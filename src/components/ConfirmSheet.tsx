'use client'

import { useEffect, useRef } from 'react'

/**
 * Hộp xác nhận. `danger` (mặc định, trước khi xóa/rời/lưu trữ): nút dùng màu "chưa trả" của bộ token;
 * `primary` (gửi hóa đơn, cập nhật): nút màu nhấn như nút chính của mockup.
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
  tone = 'danger',
}: {
  title: string
  body: string
  confirmLabel: string
  pending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  tone?: 'danger' | 'primary'
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="flex w-full max-w-[390px] flex-col gap-3 rounded-[24px] border border-line bg-card p-[18px]"
      >
        <h2 id="confirm-title" className="m-0 text-[17px] font-bold">
          {title}
        </h2>
        <p id="confirm-body" className="m-0 text-[14px] leading-normal text-muted">
          {body}
        </p>
        {error && (
          <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
            {error}
          </p>
        )}
        <div className="mt-1 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="h-[50px] flex-1 cursor-pointer rounded-[25px] border border-line2 bg-inner font-[inherit] text-[15px] font-semibold text-text disabled:cursor-default disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`h-[50px] flex-1 cursor-pointer rounded-[25px] border-0 font-[inherit] text-[15px] font-bold disabled:cursor-default disabled:opacity-60 ${
              tone === 'primary' ? 'bg-accent text-[#1A0F06]' : 'bg-unpaid-bg text-unpaid-fg'
            }`}
          >
            {pending ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
