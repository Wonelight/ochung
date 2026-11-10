import type { UtilityResult } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import type { UtilityKey, UtilitySnapshot } from '@/lib/period-edits'
import { CategoryIcon } from './CategoryIcon'

// Khối Điện / Nước của mockup `Biểu phí tháng 11`: nền inner bo 18, đầu khối icon + tên + tổng tiền,
// lưới 3 ô (Chỉ số / Tiêu thụ / Đơn giá) nền deep bo 12. Ngoài mockup: bảng giá nhiều bậc hoặc có VAT/phụ phí thì
// hiện thêm từng dòng của hóa đơn (spec §5.2: chủ nhà so với hóa đơn giấy); chế độ "Nhập tổng" chỉ có một dòng ghi chú.

const LABEL: Record<UtilityKey, string> = { electricity: 'Điện', water: 'Nước' }
const UNIT: Record<UtilityKey, string> = { electricity: 'kWh', water: 'm³' }

const pct = (n: number) => `${String(n).replace('.', ',')}%`

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[12px] bg-deep p-2.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="break-words text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function UtilityCard({ utility, snapshot, result }: { utility: UtilityKey; snapshot: UtilitySnapshot; result: UtilityResult | null }) {
  const unit = UNIT[utility]
  const t = result?.tariff
  const single = t && t.lines.length === 1 && t.vat === 0 && t.surcharges.length === 0
  const breakdown: { label: string; amount: number }[] = []
  if (t && !single) {
    t.lines.forEach((l, i) => breakdown.push({ label: `Bậc ${i + 1} · ${formatVnd(l.units)} ${unit} × ${formatVnd(l.price)} đ`, amount: l.amount }))
    if (snapshot.tariff && snapshot.tariff.vatPct > 0) breakdown.push({ label: `VAT ${pct(snapshot.tariff.vatPct)}`, amount: t.vat })
    t.surcharges.forEach((s, i) => {
      const p = snapshot.tariff?.surcharges[i]?.pct
      breakdown.push({ label: p !== undefined ? `${s.name} ${pct(p)}` : s.name, amount: s.amount })
    })
  }

  return (
    <div className="relative flex flex-col gap-3 rounded-[18px] bg-inner p-3.5">
      <div className="flex items-center gap-2.5">
        <CategoryIcon kind={utility === 'electricity' ? 'elec' : 'water'} />
        <span className="flex-1 text-[15px] font-semibold">{LABEL[utility]}</span>
        {result ? (
          <span className="font-numeric text-[16px] font-semibold tracking-[-0.03em] tabular-nums">{formatVnd(result.total)} đ</span>
        ) : (
          <span className="text-[13px] text-muted">Chưa nhập</span>
        )}
      </div>
      {t && result?.usage !== undefined && snapshot.prev !== null && snapshot.curr !== null && (
        <div className="grid grid-cols-3 gap-2">
          <Cell label="Chỉ số" value={`${formatVnd(snapshot.prev)} → ${formatVnd(snapshot.curr)}`} />
          <Cell label="Tiêu thụ" value={`${formatVnd(result.usage)} ${unit}`} />
          <Cell label="Đơn giá" value={single ? `${formatVnd(t.lines[0].price)} đ/${unit}` : 'Theo bậc'} />
        </div>
      )}
      {breakdown.length > 0 && (
        <div className="flex flex-col gap-1">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-baseline justify-between gap-3 text-[12px] text-muted">
              <span>{b.label}</span>
              <span className="tabular-nums">{formatVnd(b.amount)} đ</span>
            </div>
          ))}
        </div>
      )}
      {result && !t && <span className="text-[13px] text-muted">Nhập tổng theo hóa đơn</span>}
    </div>
  )
}
