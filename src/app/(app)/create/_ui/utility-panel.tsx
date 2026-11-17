'use client'

import { CategoryIcon } from '@/components/CategoryIcon'
import { formatVnd } from '@/lib/money'
import type { UtilityKey, UtilitySnapshot } from '@/lib/period-edits'
import { MoneyInput } from '../../house/_ui/settings-parts'

// Thẻ Điện / Nước của mockup `Tạo hóa đơn tháng`: nền panel, viền line, bo 20, đệm 14. Hai radio chọn cách nhập của tháng này:
// "Theo chỉ số" = Chỉ số cũ (nền field, chữ nhạt như mockup; sửa được nếu cần) + Chỉ số mới (viền line2, khi gõ viền cam có quầng);
// "Nhập thẳng tiền" = một ô số tiền. Cách mặc định theo cài đặt của nhà; "Theo chỉ số" cần nhà đã cài bảng giá.

const LABEL: Record<UtilityKey, string> = { electricity: 'Điện', water: 'Nước' }
const UNIT: Record<UtilityKey, string> = { electricity: 'kWh', water: 'm³' }
const READING_DIGITS = 9

const fieldBase =
  'h-12 w-full min-w-0 scroll-mb-32 rounded-[12px] px-3.5 font-[inherit] text-[17px] font-semibold tabular-nums outline-none box-border'
const currClass = `${fieldBase} border border-line2 bg-input text-text focus:border-[1.5px] focus:border-accent focus:shadow-[0_0_0_4px_rgba(232,131,58,0.14)]`
const prevClass = `${fieldBase} border-0 bg-field text-muted focus:text-text focus:shadow-[inset_0_0_0_1.5px_#E8833A]`

function ReadingInput({ id, value, onChange, className, label }: { id: string; value: number | null; onChange: (v: number | null) => void; className: string; label?: string }) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={label}
      value={value === null ? '' : String(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, READING_DIGITS)
        onChange(digits === '' ? null : Number(digits))
      }}
      className={className}
    />
  )
}

function ModeRadios({
  label,
  value,
  canTiered,
  onChange,
}: {
  label: string
  value: 'tiered' | 'total'
  canTiered: boolean
  onChange: (mode: 'tiered' | 'total') => void
}) {
  const options: { mode: 'tiered' | 'total'; text: string; disabled: boolean }[] = [
    { mode: 'tiered', text: 'Theo chỉ số', disabled: !canTiered },
    { mode: 'total', text: 'Nhập thẳng tiền', disabled: false },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label={`Cách nhập ${label.toLowerCase()}`} className="grid grid-cols-2 gap-1 rounded-[14px] border border-line bg-[var(--c-create-seg-bg)] p-1">
        {options.map((o) => {
          const on = value === o.mode
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              onClick={() => onChange(o.mode)}
              className={`h-10 cursor-pointer rounded-[10px] border-0 font-[inherit] text-[13px] font-semibold disabled:cursor-default disabled:opacity-40 ${
                on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1px_var(--c-line2)]' : 'bg-transparent text-muted'
              }`}
            >
              {o.text}
            </button>
          )
        })}
      </div>
      {!canTiered && <span className="text-[12px] leading-snug text-muted">Chưa cài bảng giá {label.toLowerCase()}: cài ở Quản lý nhà để nhập theo chỉ số.</span>}
    </div>
  )
}

export function UtilityPanel({
  utility,
  snapshot,
  value,
  onChange,
  amount,
  prevMonth,
  warning,
}: {
  utility: UtilityKey
  /** Chế độ và bảng giá của tháng (bản chụp). */
  snapshot: UtilitySnapshot
  value: { mode: 'tiered' | 'total'; prev: number | null; curr: number | null; total: number | null }
  onChange: (patch: { mode?: 'tiered' | 'total'; prev?: number | null; curr?: number | null; total?: number | null }) => void
  /** Tiền điện/nước của cả nhà theo lần tính gần nhất. */
  amount: number | null
  prevMonth: number
  warning?: string | null
}) {
  const unit = UNIT[utility]
  const tiered = value.mode === 'tiered'
  const canTiered = Boolean(snapshot.tariff && snapshot.tariff.tiers.length > 0)
  const usage = value.prev !== null && value.curr !== null ? value.curr - value.prev : null
  const tiers = snapshot.tariff
  const single = tiers && tiers.tiers.length === 1 && tiers.vatPct === 0 && tiers.surcharges.length === 0 ? tiers.tiers[0].price : null
  const decreased = usage !== null && usage < 0

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-[var(--c-create-panel)] p-3.5">
      <div className="flex items-center gap-2.5">
        <CategoryIcon kind={utility === 'electricity' ? 'elec' : 'water'} />
        <span className="flex-1 text-[15px] font-semibold">{LABEL[utility]}</span>
        <span className="font-numeric text-[15px] font-semibold tracking-[-0.03em] tabular-nums">
          {amount === null ? '— đ' : `${formatVnd(amount)} đ`}
        </span>
      </div>
      <ModeRadios label={LABEL[utility]} value={value.mode} canTiered={canTiered} onChange={(mode) => onChange({ mode })} />
      {tiered ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${utility}-prev`} className="text-[12px] text-muted">
                Chỉ số cũ (T{prevMonth})
              </label>
              <ReadingInput id={`${utility}-prev`} value={value.prev} onChange={(prev) => onChange({ prev })} className={prevClass} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${utility}-curr`} className="text-[12px] text-muted">
                Chỉ số mới
              </label>
              <ReadingInput id={`${utility}-curr`} value={value.curr} onChange={(curr) => onChange({ curr })} className={currClass} />
            </div>
          </div>
          {decreased ? (
            <p role="alert" className="m-0 text-[13px] font-medium text-unpaid-fg">
              Chỉ số mới phải ≥ chỉ số cũ
            </p>
          ) : (
            <span className="text-[13px] text-muted tabular-nums">
              {usage === null
                ? `Nhập chỉ số mới để tính tiền ${LABEL[utility].toLowerCase()}`
                : single !== null
                  ? `${formatVnd(usage)} ${unit} × ${formatVnd(single)} đ`
                  : `${formatVnd(usage)} ${unit} · tính theo bậc giá`}
            </span>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${utility}-total`} className="text-[12px] text-muted">
            Tổng tiền trên hóa đơn
          </label>
          <MoneyInput id={`${utility}-total`} value={value.total} onChange={(total) => onChange({ total })} placeholder="0" className={currClass} />
        </div>
      )}
      {warning && <p className="m-0 text-[12px] leading-snug text-muted">{warning}</p>}
    </div>
  )
}
