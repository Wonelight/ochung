'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { setCurrentHouseCookie } from '@/server/current-house'
import { acceptInvite, cancelJoinRequest, requestJoinByCode } from '@/server/invites'

export async function requestJoinAction(code: string) {
  return runAction(async () => {
    const actor = await getActor()
    const res = await requestJoinByCode(db, actor, code)
    revalidatePath('/vao-nha')
    return res
  })
}

export async function cancelJoinRequestAction(requestId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await cancelJoinRequest(db, actor, requestId)
    revalidatePath('/vao-nha')
  })
}

/** Vào nhà bằng link mời (trang /moi/[token] gọi): vào xong thì chọn luôn nhà đó làm nhà đang dùng. */
export async function acceptInviteAction(token: string) {
  return runAction(async () => {
    const actor = await getActor()
    const { houseId } = await acceptInvite(db, actor, token)
    await setCurrentHouseCookie(houseId)
    revalidatePath('/', 'layout')
    return { houseId }
  })
}
