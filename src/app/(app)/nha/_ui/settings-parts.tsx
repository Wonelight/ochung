'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { caretAfterDigits, readMoneyInput, showMoneyInput } from '@/lib/money-input'
import type { ActionResult } from '@/server/action-result'

// Các mảnh dùng chung cho mục cài đặt trong Quản lý nhà. Mục này không có mockup riêng nên dùng lại số đo của
// mockup `Quản lý nhà`: ô nhập 50px/bo 14 như khối "Thêm bằng mã tài khoản", thẻ danh sách bo 20, hàng cao tối thiểu 60,
// công tắc 52×44 như màn "Tạo hóa đơn".

export const inputClass =
  'h-[50px] min-w-0 rounded-[14px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none placeholder:text-faint focus:border-accent'
export const compactInputClass =
  'h-11 min-w-0 rounded-[14px] border border-line2 bg-input px-3 font-[inherit] text-[16px] text-text outline-none placeholder:text-faint focus:border-accent'
export const secondaryButtonClass =
  'flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border border-line2 bg-inner px-4 font-[inherit] text-[15px] font-semibold text-text disabled:cursor-default disabled:opacity-60'
export const primaryButtonClass =
  'flex h-11 cursor-pointer items-center justify-center rounded-[22px] border-0 bg-accent px-5 font-[inherit] text-[14px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60'
export const ghostButtonClass =
  'flex h-11 cursor-pointer items-center justify-center rounded-[22px] border border-line2 bg-transparent px-4 font-[inherit] text-[14px] font-semibold text-muted disabled:cursor-default disabled:opacity-60'
export const listCardClass = 'flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5'
export const formCardClass = 'flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-3.5'

export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[17px] font-semibold">{title}</h2>
        {hint && <p className="m-0 text-[13px] leading-snug text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
      {children}
    </label>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
      {children}
    </p>
  )
}

export function NoticeText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="status" className="m-0 text-[13px] font-medium text-accent-text">
      {children}
    </p>
  )
}

/** Hai hoặc ba lựa chọn một chạm (cao 44px). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[14px] bg-inner p-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`h-11 min-w-0 flex-1 cursor-pointer rounded-[10px] border-0 px-2 font-[inherit] text-[14px] font-semibold ${
              on ? 'bg-accent text-[#1A0F06]' : 'bg-transparent text-muted'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Công tắc 52×44 với rãnh 46×28 như mockup `Tạo hóa đơn tháng`. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-[52px] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
    >
      <span
        className="box-border flex h-7 w-[46px] items-center rounded-[14px] p-0.5"
        style={{ background: checked ? '#E8833A' : 'var(--c-line2)', justifyContent: checked ? 'flex-end' : 'flex-start' }}
      >
        <span className="size-6 rounded-full bg-[var(--c-knob)] shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
      </span>
    </button>
  )
}

/** Nút − / + cho số nguyên nhỏ. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
}) {
  const btn =
    'flex size-11 cursor-pointer items-center justify-center rounded-full border border-line2 bg-inner p-0 text-text disabled:cursor-default disabled:opacity-40'
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center">
      <button type="button" aria-label={`Giảm ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className={btn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span className="font-numeric w-9 text-center text-[16px] font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label={`Tăng ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className={btn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Ô nhập tiền: bàn phím số (`inputmode="numeric"`), tự chèn dấu chấm nghìn ngay khi gõ, không nhận số lẻ.
 * Giữ con trỏ đúng chữ số sau khi chèn dấu để sửa giữa chuỗi không bị nhảy về cuối.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  label,
  className = inputClass,
  suffix = 'đ',
}: {
  id?: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  label?: string
  className?: string
  suffix?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const caretDigits = useRef<number | null>(null)
  const text = showMoneyInput(value)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && caretDigits.current !== null && document.activeElement === el) {
      const pos = caretAfterDigits(el.value, caretDigits.current)
      el.setSelectionRange(pos, pos)
    }
    caretDigits.current = null
  })

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const el = e.target
          caretDigits.current = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length
          onChange(readMoneyInput(el.value))
        }}
        className={`${className} w-full ${suffix ? 'pr-8' : ''}`}
      />
      {suffix && (
        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">
          {suffix}
        </span>
      )}
    </div>
  )
}

/**
 * Gọi một server action và gom trạng thái: đang chạy, lỗi, thông báo. Lỗi mạng hiện câu chung.
 * Trả `{ data }` khi thành công (để người gọi đóng form…) và làm mới trang để thấy dữ liệu mới.
 */
export function useSave() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, okNotice?: string): Promise<{ data: T } | null> => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const res = await fn()
        if (!res.ok) {
          setError(res.message)
          return null
        }
        if (okNotice) setNotice(okNotice)
        router.refresh()
        return { data: res.data }
      } catch {
        setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
        return null
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  const reset = useCallback(() => {
    setError(null)
    setNotice(null)
  }, [])

  return { busy, error, notice, run, reset, setError, setNotice }
}
