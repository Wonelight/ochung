'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import type { PeriodMember, Payslip } from '@/lib/billing/types'
import { formatVnd } from '@/lib/money'
import { Switch } from '../../nha/_ui/settings-parts'
import { DaysInput } from './days-input'

// Số ngày ở và "Tính tháng này" của từng người (spec §5.3, §10; mockup không có khối này nên dùng lại thẻ panel và
// công tắc của màn Tạo, ô nhập số ngày của DaysInput: chọn "Số ngày" (ô gõ + nút −/+) hoặc "Từ – đến ngày"). Dưới tên là số tiền của người đó theo lần tính gần nhất.
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
  seeds,
  values,
  payslips,
  leftIds,
  daysInMonth,
  year,
  month,
  onChange,
  onInvalidRanges,
}: {
  members: PeriodMember[]
  /** Hạt giống ảnh đại diện theo id thành viên. */
  seeds: Record<string, string>
  values: Record<string, { days: number; included: boolean }>
  payslips: Payslip[] | null
  leftIds: Set<string>
  daysInMonth: number
  year: number
  month: number
  onChange: (memberId: string, patch: { days?: number; included?: boolean }) => void
  /** Tên những người đang có khoảng "Từ – đến ngày" sai (rỗng khi không có). */
  onInvalidRanges?: (names: string[]) => void
}) {
  // Gần như tháng nào cả nhà cũng ở đủ: khi đó chỉ hiện một dòng tóm tắt, mở ra khi cần chỉnh. Có người vắng hoặc không tính thì mở sẵn.
  const rest = members.filter((m) => {
    const v = values[m.memberId] ?? { days: m.days, included: m.included }
    return !v.included || v.days < daysInMonth
  })
  const [open, setOpen] = useState(rest.length > 0)
  const [bad, setBad] = useState<Record<string, boolean>>({})
  const reportRef = useRef(onInvalidRanges)
  useEffect(() => {
    reportRef.current = onInvalidRanges
  })
  useEffect(() => {
    reportRef.current?.(members.filter((m) => bad[m.memberId]).map((m) => m.name))
  }, [bad, members])
  const summary = rest.length === 0 ? `Cả ${members.length} người ở đủ ${daysInMonth} ngày` : `${rest.length} người vắng hoặc không tính`

  return (
    <section aria-label="Số ngày ở" className="flex flex-col rounded-[20px] border border-line bg-[var(--c-create-panel)] px-3.5 py-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 py-1.5 text-left font-[inherit] text-text ${open ? 'border-b border-solid border-line' : ''}`}
      >
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold">Số ngày ở</span>
          <span className="text-[12px] text-muted">{open ? `Tháng ${month} có ${daysInMonth} ngày` : summary}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-accent-text">
          {open ? 'Thu gọn' : 'Chỉnh'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? 'rotate-180' : ''}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open &&
        members.map((m, i) => {
        const v = values[m.memberId] ?? { days: m.days, included: m.included }
        const slip = payslips?.find((p) => p.memberId === m.memberId)
        return (
          <div key={m.memberId} className={`flex flex-col gap-1 py-2.5 ${i < members.length - 1 ? 'border-b border-line' : ''}`}>
            <div className="flex items-center gap-2.5">
              <Avatar seed={seeds[m.memberId] ?? m.name} size={36} />
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
              <div className="pl-[46px]">
                <DaysInput value={v.days} max={daysInMonth} name={m.name} year={year} month={month} onChange={(days) => onChange(m.memberId, { days })} onInvalid={(isBad) => setBad((prev) => (prev[m.memberId] === isBad ? prev : { ...prev, [m.memberId]: isBad }))} />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
