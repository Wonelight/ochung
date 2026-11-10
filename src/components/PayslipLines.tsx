import type { PayslipLine, YM } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { groupLines, lineDetail } from '@/lib/payslip-view'

// Các dòng của một phiếu, theo nhóm Khoản cố định / Điện nước theo ngày ở / Chi phát sinh. Không có mockup riêng:
// tiêu đề nhóm như "Các tháng trước" (12px, in hoa, giãn chữ), thẻ danh sách như màn Hóa đơn (surface, bo 20).
export function PayslipLines({ lines, ym, spentOnById }: { lines: PayslipLine[]; ym: YM; spentOnById: Map<string, string> }) {
  const groups = groupLines(lines)
  if (groups.length === 0) return <p className="m-0 text-[14px] text-muted">Phiếu này chưa có khoản nào.</p>
  return (
    <>
      {groups.map((g) => (
        <section key={g.group} className="flex flex-col gap-2">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</h3>
          <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
            {g.lines.map((l, i) => (
              <div key={l.key} className={`flex min-h-[56px] items-center gap-3 py-2 ${i < g.lines.length - 1 ? 'border-b border-line' : ''}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{l.label}</span>
                  {l.detail && <span className="text-[12px] text-muted tabular-nums">{lineDetail(l, ym, spentOnById)}</span>}
                </div>
                <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatVnd(l.amount)} đ</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
