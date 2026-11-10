'use client'

import { useState } from 'react'
import { ErrorText, NoticeText, SettingsSection, Segmented, formCardClass, primaryButtonClass, useSave } from '../../nha/_ui/settings-parts'
import { sendHouseMessageAction } from '../actions'

const MAX = 200

/** Chủ nhà soạn tin gửi cả nhà hoặc người chưa đóng (spec §8: một trong hai trường hợp được gửi thông báo đẩy). */
export function ComposeMessage({ houseId }: { houseId: string }) {
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'all' | 'unpaid'>('all')
  const [sent, setSent] = useState<number | null>(null)
  const { busy, error, run, reset } = useSave()
  const empty = body.trim().length === 0

  async function send() {
    const res = await run(() => sendHouseMessageAction(houseId, body, audience))
    if (res) {
      setBody('')
      setSent(res.data.recipients) // chữ báo thành công phụ thuộc số người nhận nên không dùng okNotice của useSave
    }
  }

  return (
    <SettingsSection title="Gửi tin cho cả nhà" hint="Tin này hiện ở chuông và gửi thông báo đẩy tới điện thoại của người nhận.">
      <div className={formCardClass}>
        <Segmented
          label="Người nhận"
          value={audience}
          onChange={(v) => {
            setAudience(v)
            setSent(null)
            reset()
          }}
          options={[
            { value: 'all', label: 'Cả nhà' },
            { value: 'unpaid', label: 'Người chưa đóng' },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <textarea
            aria-label="Nội dung tin nhắn"
            value={body}
            maxLength={MAX}
            rows={3}
            placeholder="Ví dụ: Mai cắt nước từ 8h đến 10h"
            onChange={(e) => {
              setBody(e.target.value)
              setSent(null)
            }}
            className="min-h-[88px] resize-none rounded-[14px] border border-line2 bg-input px-3.5 py-3 font-[inherit] text-[16px] text-text outline-none placeholder:text-faint focus:border-accent"
          />
          <span className="self-end text-[12px] tabular-nums text-faint">
            {body.length}/{MAX}
          </span>
        </div>
        <button type="button" disabled={busy || empty} onClick={() => void send()} className={primaryButtonClass}>
          {busy ? 'Đang gửi…' : 'Gửi'}
        </button>
        <ErrorText>{error}</ErrorText>
        <NoticeText>{sent === null ? null : sent === 0 ? 'Không có ai để nhận tin này' : `Đã gửi cho ${sent} người`}</NoticeText>
      </div>
    </SettingsSection>
  )
}
