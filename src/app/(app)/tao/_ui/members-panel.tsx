'use client'

import { Avatar } from '@/components/Avatar'
import type { PeriodMember, Payslip } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { Stepper, Switch } from '../../nha/_ui/settings-parts'

// Số ngày ở và "Tính tháng này" của từng người (spec §5.3, §10; mockup không có khối này nên dùng lại thẻ panel và
// công tắc của màn Tạo, bước nhảy −/+ 44px của Quản lý nhà). Dưới tên là số tiền của người đó theo lần tính gần nhất.
// Người đã rời nhà (vẫn còn trong tháng nháp) được ghi "đã rời" để chủ nhà tự quyết có tính hay không.

function amountNote(slip: Payslip | undefined, on: boolean): string {
  if (!on) return 'Không tính tháng này'
  if (!slip) return '—'
  if (slip.due === null) return `Phần của bạn ${formatVnd(slip.share)} đ`
  if (slip.due < 0) return `Được trả lại ${formatVnd(-slip.due)} đ`
  return `Cần chuyển ${formatVnd(slip.due)} đ`
}

export function MembersPanel({
  members,
  values,
  payslips,
  leftIds,
  daysInMonth,
  month,
  onChange,
}: {
  members: PeriodMember[]
  values: Record<string, { days: number; included: boolean }>
  payslips: Payslip[] | null
  leftIds: Set<string>
  daysInMonth: number
  month: number
  onChange: (memberId: string, patch: { days?: number; included?: boolean }) => void
}) {
  return (
    <section aria-label="Số ngày ở" className="flex flex-col rounded-[20px] border border-line bg-[var(--c-create-panel)] px-3.5 py-1">
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line py-1.5">
        <div className="flex flex-col">
          <h2 className="m-0 text-[15px] font-semibold">Số ngày ở</h2>
          <span className="text-[12px] text-muted">
            Tháng {month} có {daysInMonth} ngày
          </span>
        </div>
        <span className="text-right text-[12px] text-muted">Tính tháng này</span>
      </div>
      {members.map((m, i) => {
        const v = values[m.memberId] ?? { days: m.days, included: m.included }
        const slip = payslips?.find((p) => p.memberId === m.memberId)
        return (
          <div key={m.memberId} className={`flex flex-col gap-1 py-2.5 ${i < members.length - 1 ? 'border-b border-line' : ''}`}>
            <div className="flex items-center gap-2.5">
              <Avatar seed={m.name} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">
                  {m.name}
                  {leftIds.has(m.memberId) && <span className="text-[12px] font-medium text-muted"> · đã rời</span>}
                </span>
                <span className="text-[12px] text-muted tabular-nums">{amountNote(slip, v.included)}</span>
              </div>
              <Switch checked={v.included} onChange={(included) => onChange(m.memberId, { included })} label={`Tính tháng này cho ${m.name}`} />
            </div>
            {v.included && (
              <div className="flex items-center justify-between pl-[46px]">
                <span className="text-[13px] text-muted">Số ngày ở</span>
                <Stepper
                  value={v.days}
                  min={0}
                  max={daysInMonth}
                  onChange={(days) => onChange(m.memberId, { days })}
                  label={`số ngày ở của ${m.name}`}
                />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
