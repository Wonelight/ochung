'use client'

import { useState } from 'react'
import type { Tariff } from '@/lib/billing/types'
import { saveUtilityTariffAction } from '../actions'
import {
  ErrorText,
  FieldLabel,
  MoneyInput,
  NoticeText,
  Segmented,
  Stepper,
  Switch,
  compactInputClass,
  formCardClass,
  ghostButtonClass,
  primaryButtonClass,
  useSave,
} from './settings-parts'

type TierDraft = { upTo: string; price: number | null }
type SurchargeDraft = { name: string; pct: string }
type Mode = 'tiered' | 'total'

const MODE_OPTIONS = [
  { value: 'tiered' as const, label: 'Theo bậc' },
  { value: 'total' as const, label: 'Nhập tổng' },
]

const pctText = (n: number) => String(n).replace('.', ',')

/** Số phần trăm người gõ ("7,5" hoặc "7.5") -> number; rỗng = 0; không phải số -> null. */
function readPct(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return 0
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

function toDrafts(tariff: Tariff): TierDraft[] {
  if (tariff.tiers.length === 0) return [{ upTo: '', price: null }]
  return tariff.tiers.map((t) => ({ upTo: t.upTo === null ? '' : String(t.upTo), price: t.price }))
}

/**
 * Điện hoặc nước: chọn chế độ, soạn bảng giá bậc thang (bậc cuối luôn không giới hạn), VAT, phụ phí,
 * công tắc định mức theo số người và số người đăng ký. Một nút Lưu cho cả mục.
 */
export function UtilitySettings({
  houseId,
  utility,
  title,
  unit,
  initialMode,
  initialTariff,
}: {
  houseId: string
  utility: 'electricity' | 'water'
  title: string
  unit: string
  initialMode: Mode
  initialTariff: Tariff
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [tiers, setTiers] = useState<TierDraft[]>(() => toDrafts(initialTariff))
  const [perPerson, setPerPerson] = useState(initialTariff.perPerson)
  const [people, setPeople] = useState(initialTariff.registeredPeople)
  const [vat, setVat] = useState(() => pctText(initialTariff.vatPct))
  const [surcharges, setSurcharges] = useState<SurchargeDraft[]>(() =>
    initialTariff.surcharges.map((s) => ({ name: s.name, pct: pctText(s.pct) })),
  )
  const { busy, error, notice, run, reset, setError } = useSave()
  const id = `${utility}`

  const patchTier = (i: number, patch: Partial<TierDraft>) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'total') {
      // Giữ nguyên bảng giá đang lưu; chỉ đổi chế độ.
      await run(() => saveUtilityTariffAction(houseId, utility, { mode: 'total', tariff: null }), 'Đã lưu')
      return
    }
    const built: Tariff['tiers'] = []
    for (const [i, t] of tiers.entries()) {
      const last = i === tiers.length - 1
      if (t.price === null) return setError(`Hãy nhập đơn giá cho bậc ${i + 1}`)
      if (last) {
        built.push({ upTo: null, price: t.price })
        continue
      }
      const upTo = /^\d+$/.test(t.upTo.trim()) ? Number(t.upTo.trim()) : null
      if (upTo === null) return setError(`Mốc của bậc ${i + 1} phải là số nguyên ${unit}`)
      built.push({ upTo, price: t.price })
    }
    const vatPct = readPct(vat)
    if (vatPct === null) return setError('VAT phải là số, ví dụ 8 hoặc 7,5')
    const built2: Tariff['surcharges'] = []
    for (const s of surcharges) {
      const pct = readPct(s.pct)
      if (pct === null) return setError(`Phần trăm của phụ phí "${s.name}" phải là số`)
      built2.push({ name: s.name, pct })
    }
    const tariff: Tariff = { tiers: built, perPerson, registeredPeople: people, vatPct, surcharges: built2 }
    await run(() => saveUtilityTariffAction(houseId, utility, { mode: 'tiered', tariff }), 'Đã lưu')
  }

  return (
    <form onSubmit={onSubmit} className={formCardClass} aria-label={title}>
      <Segmented label={`Chế độ ${title.toLowerCase()}`} value={mode} options={MODE_OPTIONS} onChange={(m) => { reset(); setMode(m) }} />

      {mode === 'total' ? (
        <p className="m-0 text-[13px] leading-snug text-muted">
          Mỗi tháng bạn gõ thẳng số tiền {title.toLowerCase()} trên hóa đơn. Bảng giá bậc đã cài (nếu có) vẫn được giữ lại.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <FieldLabel>Bảng giá bậc thang</FieldLabel>
            <div className="flex flex-col gap-2">
              {tiers.map((t, i) => {
                const last = i === tiers.length - 1
                const prevUpTo = i > 0 ? tiers[i - 1].upTo.trim() : ''
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-[12px] text-muted">
                      {last
                        ? tiers.length === 1
                          ? 'Mọi mức dùng'
                          : `Từ ${prevUpTo || '…'} ${unit} trở lên`
                        : `Bậc ${i + 1}: đến hết ${t.upTo.trim() || '…'} ${unit}`}
                    </span>
                    <div className="flex items-center gap-2">
                      {last ? (
                        <span className="flex h-11 w-[116px] shrink-0 items-center whitespace-nowrap rounded-[14px] border border-line bg-inner px-3 text-[13px] text-muted">
                          Không giới hạn
                        </span>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`Mốc bậc ${i + 1} (${unit})`}
                          placeholder={unit}
                          value={t.upTo}
                          onChange={(e) => patchTier(i, { upTo: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                          className={`${compactInputClass} w-[116px] shrink-0`}
                        />
                      )}
                      <MoneyInput
                        label={`Đơn giá bậc ${i + 1}`}
                        value={t.price}
                        onChange={(price) => patchTier(i, { price })}
                        placeholder="Đơn giá"
                        className={compactInputClass}
                        suffix={`đ/${unit}`}
                      />
                      {tiers.length > 1 && !last ? (
                        <IconButton label={`Xóa bậc ${i + 1}`} onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))}>
                          <path d="M18 6 6 18M6 6l12 12" />
                        </IconButton>
                      ) : (
                        <span className="size-11 shrink-0" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setTiers((ts) => [...ts.slice(0, -1), { upTo: '', price: null }, ts[ts.length - 1]])}
              className="flex h-11 w-fit cursor-pointer items-center gap-1.5 rounded-[22px] border border-line2 bg-transparent px-4 font-[inherit] text-[14px] font-semibold text-accent-text"
            >
              + Thêm bậc
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px]">Định mức theo số người</span>
              <span className="text-[12px] leading-snug text-muted">
                {perPerson ? 'Mốc các bậc nhân với số người đăng ký' : 'Mốc các bậc cố định cho cả hộ'}
              </span>
            </div>
            <Switch checked={perPerson} onChange={setPerPerson} label={`Định mức ${title.toLowerCase()} theo số người`} />
          </div>
          {perPerson && (
            <div className="flex items-center gap-3">
              <span className="flex-1 text-[15px]">Số người đăng ký</span>
              <Stepper label="số người đăng ký" value={people} min={1} max={99} onChange={setPeople} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${id}-vat`}>VAT</FieldLabel>
            <div className="flex">
              <PctField id={`${id}-vat`} value={vat} onChange={setVat} label="VAT (%)" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <FieldLabel>Phụ phí (tính theo % tiền gốc)</FieldLabel>
            {surcharges.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  aria-label={`Tên phụ phí ${i + 1}`}
                  placeholder="VD: Phí bảo vệ môi trường"
                  maxLength={40}
                  value={s.name}
                  onChange={(e) => setSurcharges((ss) => ss.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className={`${compactInputClass} min-w-0 flex-1`}
                />
                <div className="w-[88px] shrink-0">
                  <PctField
                    value={s.pct}
                    label={`Phần trăm phụ phí ${i + 1}`}
                    onChange={(pct) => setSurcharges((ss) => ss.map((x, j) => (j === i ? { ...x, pct } : x)))}
                  />
                </div>
                <IconButton label={`Xóa phụ phí ${i + 1}`} onClick={() => setSurcharges((ss) => ss.filter((_, j) => j !== i))}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSurcharges((ss) => [...ss, { name: '', pct: '' }])}
              className="flex h-11 w-fit cursor-pointer items-center gap-1.5 rounded-[22px] border border-line2 bg-transparent px-4 font-[inherit] text-[14px] font-semibold text-accent-text"
            >
              + Thêm phụ phí
            </button>
          </div>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <NoticeText>{notice}</NoticeText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            reset()
            setMode(initialMode)
            setTiers(toDrafts(initialTariff))
            setPerPerson(initialTariff.perPerson)
            setPeople(initialTariff.registeredPeople)
            setVat(pctText(initialTariff.vatPct))
            setSurcharges(initialTariff.surcharges.map((s) => ({ name: s.name, pct: pctText(s.pct) })))
          }}
          className={ghostButtonClass}
        >
          Hoàn tác
        </button>
      </div>
    </form>
  )
}

function PctField({ id, value, onChange, label }: { id?: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
        className={`${compactInputClass} w-full pr-8`}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">
        %
      </span>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[22px] border-0 bg-transparent p-0 text-muted"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}
