'use client'

import { useEffect, useRef, useState } from 'react'

// Số ngày ở của một người trong tháng, hai cách nhập chọn bằng radio:
// - "Số ngày": ô gõ số và nút −/+ nhỏ, cùng cỡ. Ô gõ giữ chữ đang gõ riêng (cho phép xóa hết rồi gõ số mới), chỉ báo lên ngoài khi là
//   số hợp lệ; số quá lớn bị kẹp về N, rời ô thì hiện lại đúng giá trị đang dùng.
// - "Từ – đến ngày": hai ô chọn ngày trong tháng, số ngày = từ ngày đến ngày (tính cả hai đầu).
// Cả hai cùng sửa một giá trị `days` (0..N); khoảng ngày chỉ là cách nhập, không lưu riêng.

// Nút −/+: ô bấm rộng 44px (đủ vùng chạm), vòng nhìn thấy chỉ 36px nên gọn và đều nhau
const stepBtn =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-text disabled:cursor-default disabled:opacity-40'
const stepDot = 'flex size-9 items-center justify-center rounded-full border border-line2 bg-inner'
const fieldBase =
  'box-border h-9 scroll-mb-32 rounded-[10px] border border-line2 bg-input p-0 text-[14px] font-semibold tabular-nums text-text outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(232,131,58,0.14)]'

const pad = (n: number) => String(n).padStart(2, '0')

export function DaysInput({
  value,
  max,
  name,
  year,
  month,
  onChange,
  onInvalid,
}: {
  value: number
  max: number
  name: string
  year: number
  month: number
  onChange: (days: number) => void
  /** Báo khoảng ngày đang nhập có sai không (để chặn chốt sổ: số ngày hiện dùng không phải số người dùng đang nhập). */
  onInvalid?: (invalid: boolean) => void
}) {
  const [mode, setMode] = useState<'days' | 'range'>('days')
  const [draft, setDraft] = useState<string | null>(null)
  const first = `${year}-${pad(month)}-01`
  const last = `${year}-${pad(month)}-${pad(max)}`
  const [from, setFrom] = useState(first)
  const [to, setTo] = useState(`${year}-${pad(month)}-${pad(Math.max(1, value))}`)
  const away = max - value

  function typed(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 3)
    if (digits === '') return setDraft('')
    const days = Math.min(max, Number(digits))
    setDraft(String(days))
    onChange(days)
  }

  const inMonth = (d: string) => d >= first && d <= last
  const rangeInvalid = !inMonth(from) || !inMonth(to) || to < from
  const onInvalidRef = useRef(onInvalid)
  useEffect(() => {
    onInvalidRef.current = onInvalid
  })
  useEffect(() => {
    onInvalidRef.current?.(mode === 'range' && rangeInvalid)
    return () => onInvalidRef.current?.(false)
  }, [mode, rangeInvalid])

  function setRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (inMonth(nextFrom) && inMonth(nextTo) && nextTo >= nextFrom) onChange(Number(nextTo.slice(8, 10)) - Number(nextFrom.slice(8, 10)) + 1)
  }

  const modes: { key: 'days' | 'range'; text: string }[] = [
    { key: 'days', text: 'Số ngày' },
    { key: 'range', text: 'Từ – đến ngày' },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={`Cách nhập số ngày ở của ${name}`} className="grid w-full max-w-[260px] grid-cols-2 gap-1 rounded-[12px] border border-line bg-[var(--c-create-seg-bg)] p-0.5">
        {modes.map((m) => {
          const on = mode === m.key
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.key)}
              className={`relative h-8 cursor-pointer rounded-[9px] border-0 font-[inherit] text-[12px] font-semibold before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${
                on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'bg-transparent text-muted'
              }`}
            >
              {m.text}
            </button>
          )
        })}
      </div>

      {mode === 'days' ? (
        <div className="flex items-center gap-2">
          <div role="group" aria-label={`số ngày ở của ${name}`} className="flex shrink-0 items-center">
            <button type="button" aria-label={`Giảm số ngày ở của ${name}`} disabled={value <= 0} onClick={() => onChange(value - 1)} className={stepBtn}>
              <span className={stepDot}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M5 12h14" />
              </svg>
              </span>
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label={`Nhập số ngày ở của ${name}`}
              value={draft ?? String(value)}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => typed(e.target.value)}
              onBlur={() => setDraft(null)}
              className={`${fieldBase} font-numeric w-12 text-center text-[15px]`}
            />
            <button type="button" aria-label={`Tăng số ngày ở của ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={stepBtn}>
              <span className={stepDot}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              </span>
            </button>
          </div>
          <span className="min-w-0 text-[12px] text-muted" aria-live="polite">
            / {max} ngày · {away > 0 ? `vắng ${away}` : 'ở đủ tháng'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <input
              type="date"
              aria-label={`Từ ngày của ${name}`}
              min={first}
              max={last}
              value={from}
              onChange={(e) => setRange(e.target.value || first, to)}
              className={`${fieldBase} w-full min-w-0 px-1.5 text-center text-[13px] [&::-webkit-calendar-picker-indicator]:hidden`}
            />
            <span aria-hidden="true" className="text-[13px] text-muted">
              →
            </span>
            <input
              type="date"
              aria-label={`Đến ngày của ${name}`}
              min={first}
              max={last}
              value={to}
              onChange={(e) => setRange(from, e.target.value || last)}
              className={`${fieldBase} w-full min-w-0 px-1.5 text-center text-[13px] [&::-webkit-calendar-picker-indicator]:hidden`}
            />
          </div>
          {rangeInvalid ? (
            <p role="alert" className="m-0 text-[12px] font-medium text-unpaid-fg">
              Chọn ngày trong tháng, ngày đến không trước ngày từ
            </p>
          ) : (
            <span className="text-[12px] text-muted" aria-live="polite">
              = {value} ngày{away > 0 ? ` · vắng ${away}` : ' · ở đủ tháng'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
