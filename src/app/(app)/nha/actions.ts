'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { AppError } from '@/lib/errors'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { clearCurrentHouseCookie, setCurrentHouseCookie } from '@/server/current-house'
import { archiveHouse, createHouse, leaveHouse, removeMember, requireMember, updateHouse } from '@/server/houses'

// Layout (thanh dưới, danh sách nhà) giữ nguyên giữa các trang nên phải làm mới tường minh sau mỗi thay đổi.
const refreshApp = () => revalidatePath('/', 'layout')

export async function createHouseAction(input: { name: string }) {
  return runAction(async () => {
    const actor = await getActor()
    const { houseId, code } = await createHouse(db, actor, input)
    await setCurrentHouseCookie(houseId)
    refreshApp()
    return { houseId, code }
  })
}

export async function selectHouseAction(houseId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await requireMember(db, actor, houseId)
    await setCurrentHouseCookie(houseId)
    refreshApp()
  })
}

export async function renameHouseAction(houseId: string, name: string) {
  return runAction(async () => {
    const actor = await getActor()
    await updateHouse(db, actor, houseId, { name })
    refreshApp()
  })
}

export async function removeMemberAction(houseId: string, memberId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await removeMember(db, actor, houseId, memberId)
    refreshApp()
  })
}

export async function leaveHouseAction(houseId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await leaveHouse(db, actor, houseId)
    await clearCurrentHouseCookie()
    refreshApp()
  })
}

/**
 * Lưu trữ nhà. Còn tháng đã chốt chưa thu đủ thì không lưu trữ mà trả `needsForce` kèm lời cảnh báo,
 * để giao diện hỏi xác nhận lần hai rồi gọi lại với `force`.
 */
export async function archiveHouseAction(houseId: string, force = false) {
  return runAction(async (): Promise<{ archived: true } | { archived: false; warning: string }> => {
    const actor = await getActor()
    try {
      await archiveHouse(db, actor, houseId, { force })
    } catch (e) {
      if (e instanceof AppError && e.reason === 'UNSETTLED_PERIODS') return { archived: false, warning: e.message }
      throw e
    }
    await clearCurrentHouseCookie()
    refreshApp()
    return { archived: true }
  })
}
