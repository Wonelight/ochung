'use client'

import { useMemo, useState } from 'react'
import { formatVnd } from '@/lib/money'
import type { LedgerExpense } from '@/server/expenses'

// Danh sách khoản chi lẻ của một tháng, thiết kế cho ~60 khoản trên điện thoại:
// - thanh lọc dính đầu màn: chip theo người trả (kèm tổng) và ô tìm theo nội dung (không phân biệt dấu, hoa/thường);
// - nhóm theo ngày chi (mới nhất trước), dòng ngày ghi số khoản và tổng của ngày;
// - mỗi khoản hai dòng: nội dung + số tiền; "An trả" kèm "· Linh nhập" khi người nhập khác người trả và "· chia cho …" khi không phải cả nhà;
// - hiện 30 khoản đầu, "Xem thêm" nạp tiếp.

const PAGE = 30
const WEEKDAY = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']

/** "2026-11-12" -> "Th 5, 12/11". Tính theo UTC để không lệch ngày theo múi giờ của máy. */
function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${WEEKDAY[dow]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

export function LedgerDetail({ expenses, total }: { expenses: LedgerExpense[]; total: number }) {
  const [payer, setPayer] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const payers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; count: number }>()
    for (const e of expenses) {
      const p = map.get(e.paidByMemberId) ?? { id: e.paidByMemberId, name: e.paidByName, total: 0, count: 0 }
      map.set(e.paidByMemberId, { ...p, total: p.total + e.amount, count: p.count + 1 })
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [expenses])

  const filtered = useMemo(() => {
    const q = plain(query.trim())
    return expenses.filter((e) => (payer === null || e.paidByMemberId === payer) && (q === '' || plain(e.description).includes(q)))
  }, [expenses, payer, query])

  const shown = filtered.slice(0, limit)
  const groups = useMemo(() => {
    const out: { day: string; items: LedgerExpense[] }[] = []
    for (const e of shown) {
      const last = out[out.length - 1]
      if (last && last.day === e.spentOn) last.items.push(e)
      else out.push({ day: e.spentOn, items: [e] })
    }
    return out
  }, [shown])

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0)
  const filtering = payer !== null || query.trim() !== ''

  if (expenses.length === 0) {
    return <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">Tháng này chưa có khoản chi lẻ nào.</p>
  }

  const chip = (on: boolean) =>
    `flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-0 px-3 font-[inherit] text-[13px] font-semibold ${
      on ? 'bg-[var(--c-create-seg-on)] text-text shadow-[inset_0_0_0_1.5px_#E8833A]' : 'bg-transparent text-muted shadow-[inset_0_0_0_1px_var(--c-line2)]'
    }`

  return (
    <>
      <section aria-label="Tổng chi tiêu" className="flex items-end justify-between gap-3 rounded-[20px] border border-line bg-card p-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[12px] text-muted">{filtering ? 'Đang lọc' : 'Tổng chi tiêu'}</span>
          <span className="truncate font-numeric text-[24px] font-semibold tracking-[-0.04em] tabular-nums">{formatVnd(filtering ? filteredTotal : total)} đ</span>
        </div>
        <span className="shrink-0 pb-1 text-[13px] text-muted">
          {filtering ? `${filtered.length}/${expenses.length}` : expenses.length} khoản
        </span>
      </section>

      <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-2 bg-bg px-5 pb-2 pt-1">
        <div className="relative">
          <input
            type="search"
            aria-label="Tìm theo nội dung"
            placeholder="Tìm theo nội dung"
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            className="box-border h-11 w-full min-w-0 rounded-[14px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <div role="group" aria-label="Lọc theo người trả" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            aria-pressed={payer === null}
            onClick={() => {
              setPayer(null)
              setLimit(PAGE)
            }}
            className={chip(payer === null)}
          >
            Tất cả
          </button>
          {payers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={payer === p.id}
              onClick={() => {
                setPayer(payer === p.id ? null : p.id)
                setLimit(PAGE)
              }}
              className={chip(payer === p.id)}
            >
              {p.name}
              <span className="font-normal tabular-nums">{formatVnd(p.total)}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-line bg-surface p-4 text-[14px] text-muted">Không có khoản nào khớp.</p>
      ) : (
        groups.map((g) => (
          <section key={g.day} aria-label={dayLabel(g.day)} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="m-0 text-[13px] font-semibold text-muted">{dayLabel(g.day)}</h2>
              <span className="text-[12px] tabular-nums text-muted">
                {g.items.length} khoản · {formatVnd(g.items.reduce((s, e) => s + e.amount, 0))} đ
              </span>
            </div>
            <div className="flex flex-col rounded-[18px] border border-line bg-surface px-3.5 py-0.5">
              {g.items.map((e, i) => (
                <div key={e.id} className={`flex items-start gap-3 py-2.5 ${i < g.items.length - 1 ? 'border-b border-line' : ''}`}>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-medium leading-snug">{e.description}</span>
                    <span className="text-[12px] leading-snug text-muted">
                      {e.paidByName} trả
                      {e.createdByName !== e.paidByName && (e.mine ? ' · bạn nhập' : ` · ${e.createdByName} nhập`)}
                      {e.participants && ` · chia cho ${e.participants.map((p) => p.name).join(', ')}`}
                    </span>
                  </div>
                  <span className="shrink-0 font-numeric text-[14px] font-semibold tracking-[-0.03em] tabular-nums">{formatVnd(e.amount)} đ</span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {filtered.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="flex h-11 cursor-pointer items-center justify-center rounded-[22px] border border-line2 bg-transparent font-[inherit] text-[14px] font-semibold text-text"
        >
          Xem thêm {Math.min(PAGE, filtered.length - shown.length)} khoản
        </button>
      )}
    </>
  )
}
