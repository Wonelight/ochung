'use client'

import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { avatarSeed } from '@/lib/avatar-seed'
import { formatVnd } from '@/lib/money'
import { setMemberQtyAction } from '../actions'
import { ErrorText, Stepper, listCardClass, useSave } from './settings-parts'

type PerUnitItem = { id: string; name: string; amount: number }
type Person = { id: string; displayName: string; avatarVariant: number }

const key = (memberId: string, itemId: string) => `${memberId}:${itemId}`

/**
 * "Số lượng theo người": với mỗi khoản "Theo người" (ví dụ tiền xe), số lượng của từng thành viên.
 * Mỗi lần bấm − / + lưu ngay; ô đang lưu bị khóa để các lần bấm không chạy lộn thứ tự.
 */
export function MemberQty({
  items,
  members,
  qty,
}: {
  items: PerUnitItem[]
  members: Person[]
  qty: { memberId: string; itemId: string; qty: number }[]
}) {
  const [saved, setSaved] = useState<Record<string, number>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  const { error, run } = useSave()
  const server = new Map(qty.map((q) => [key(q.memberId, q.itemId), q.qty]))
  const valueOf = (m: string, i: string) => saved[key(m, i)] ?? server.get(key(m, i)) ?? 0

  async function change(memberId: string, itemId: string, next: number) {
    const k = key(memberId, itemId)
    setPending((p) => new Set(p).add(k))
    const res = await run(() => setMemberQtyAction(memberId, itemId, next))
    if (res) setSaved((s) => ({ ...s, [k]: next }))
    setPending((p) => {
      const n = new Set(p)
      n.delete(k)
      return n
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-muted">
            {item.name} · {formatVnd(item.amount)}đ / đơn vị
          </span>
          <div className={listCardClass}>
            {members.map((m, i) => {
              const k = key(m.id, item.id)
              return (
                <div
                  key={m.id}
                  className="flex min-h-[60px] items-center gap-3"
                  style={i < members.length - 1 ? { borderBottom: '1px solid var(--c-line)' } : undefined}
                >
                  <Avatar seed={avatarSeed(m.displayName, m.avatarVariant)} size={40} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.displayName}</span>
                  <Stepper
                    label={`số lượng ${item.name} của ${m.displayName}`}
                    value={valueOf(m.id, item.id)}
                    min={0}
                    max={99}
                    disabled={pending.has(k)}
                    onChange={(v) => change(m.id, item.id, v)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
