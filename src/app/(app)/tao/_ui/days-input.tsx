'use client'

import { useState } from 'react'

// Số ngày ở của một người trong tháng: thanh kéo 0..N để chọn nhanh, ô gõ số bằng bàn phím và nút −/+ để chỉnh từng ngày.
// Ba cách cùng sửa một giá trị. Ô gõ giữ chữ đang gõ riêng (cho phép xóa hết rồi gõ số mới), chỉ báo lên ngoài khi là số
// hợp lệ; số quá lớn bị kẹp về N, rời ô thì hiện lại đúng giá trị đang dùng.

const stepBtn =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line2 bg-inner p-0 text-text disabled:cursor-default disabled:opacity-40'

export function DaysInput({ value, max, name, onChange }: { value: number; max: number; name: string; onChange: (days: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const away = max - value

  function typed(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 3)
    if (digits === '') return setDraft('')
    const days = Math.min(max, Number(digits))
    setDraft(String(days))
    onChange(days)
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          Số ngày ở{' '}
          <span className="text-[12px]" aria-live="polite">
            {away > 0 ? `· vắng ${away} ngày` : '· ở đủ tháng'}
          </span>
        </span>
        <div role="group" aria-label={`số ngày ở của ${name}`} className="flex shrink-0 items-center">
          <button type="button" aria-label={`Giảm số ngày ở của ${name}`} disabled={value <= 0} onClick={() => onChange(value - 1)} className={stepBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
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
            className="font-numeric box-border h-11 w-14 rounded-[12px] border border-line2 bg-input p-0 text-center text-[16px] font-semibold tabular-nums text-text outline-none focus:border-[1.5px] focus:border-accent focus:shadow-[0_0_0_4px_rgba(232,131,58,0.14)]"
          />
          <button type="button" aria-label={`Tăng số ngày ở của ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={stepBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="w-4 shrink-0 text-center text-[11px] text-faint tabular-nums">0</span>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label={`Kéo chọn số ngày ở của ${name}`}
          onChange={(e) => {
            setDraft(null)
            onChange(Number(e.target.value))
          }}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-[#E8833A]"
        />
        <span className="w-5 shrink-0 text-center text-[11px] text-faint tabular-nums">{max}</span>
      </div>
    </div>
  )
}
