import type { PayslipLine, YM } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { groupLines, lineDetail } from '@/lib/payslip-view'

/** Từ số khoản chi lẻ này trở lên thì gập lại (phiếu của nhà nhiều chi lẻ không bị dài hàng chục màn hình). */
const COLLAPSE_OVER = 5

// Các dòng của một phiếu, theo nhóm Khoản cố định / Điện nước theo ngày ở / Chi lẻ. Không có mockup riêng:
// tiêu đề nhóm như "Các tháng trước" (12px, in hoa, giãn chữ) kèm tổng của nhóm căn phải cùng hàng, thẻ danh sách như màn
// Hóa đơn (surface, bo 20).
export function PayslipLines({
  lines,
  ym,
  spentOnById,
  emptyText = 'Phiếu này chưa có khoản nào.',
}: {
  lines: PayslipLine[]
  ym: YM
  spentOnById: Map<string, string>
  /** Câu hiện khi phiếu không có dòng nào. */
  emptyText?: string
}) {
  const groups = groupLines(lines)
  const lineRow = (l: PayslipLine, i: number, n: number) => (
    <div key={l.key} className={`flex min-h-[56px] items-center gap-3 py-2 ${i < n - 1 ? 'border-b border-line' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{l.label}</span>
        {l.detail && <span className="text-[12px] text-muted tabular-nums">{lineDetail(l, ym, spentOnById)}</span>}
      </div>
      <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatVnd(l.amount)} đ</span>
    </div>
  )
  if (groups.length === 0) return <p className="m-0 text-[14px] text-muted">{emptyText}</p>
  return (
    <>
      {groups.map((g) => (
        <section key={g.group} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</h3>
            <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-muted tabular-nums">{formatVnd(g.total)} đ</span>
          </div>
          {g.group === 'expense' && g.lines.length > COLLAPSE_OVER ? (
            // nhiều khoản chi lẻ: gập lại thành một dòng tóm tắt, mở ra khi cần đối chiếu từng khoản
            <details className="rounded-[20px] border border-line bg-surface px-3.5 py-0.5">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 text-[15px] font-medium">
                  {g.lines.length} khoản chi <span className="text-[12px] font-normal text-muted">· chạm để xem</span>
                </span>
                <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatVnd(g.total)} đ</span>
              </summary>
              <div className="flex flex-col border-t border-line">{g.lines.map((l, i) => lineRow(l, i, g.lines.length))}</div>
            </details>
          ) : (
            <div className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 py-0.5">{g.lines.map((l, i) => lineRow(l, i, g.lines.length))}</div>
          )}
        </section>
      ))}
    </>
  )
}
