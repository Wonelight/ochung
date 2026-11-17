'use server'

import { db } from '@/db'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { markAllRead, sendHouseMessage } from '@/server/notifications'
import { getPushSender } from '@/server/push'

/** Đánh dấu đã đọc mọi thông báo của chính người gọi (gọi khi mở trang Thông báo). */
export async function markAllReadAction() {
  return runAction(async () => {
    await markAllRead(db, await getActor())
  })
}

/** Chủ nhà gửi tin cho cả nhà hoặc cho người chưa đóng (có gửi web push). Quyền chủ nhà do server kiểm. */
export async function sendHouseMessageAction(houseId: string, body: string, audience: 'all' | 'unpaid') {
  return runAction(async () => {
    return sendHouseMessage(db, getPushSender(), await getActor(), String(houseId ?? ''), {
      body: String(body ?? ''),
      audience: audience === 'unpaid' ? 'unpaid' : 'all',
    })
  })
}
