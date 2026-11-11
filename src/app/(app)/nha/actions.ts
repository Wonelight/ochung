'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { AppError } from '@/lib/errors'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { clearCurrentHouseCookie, setCurrentHouseCookie } from '@/server/current-house'
import type { Tariff } from '@/lib/billing/types'
import type { BankInfoInput } from '@/lib/validation'
import {
  deleteChargeItem,
  reorderChargeItems,
  setBankInfo,
  setDueDay,
  setMemberQty,
  setUtilityTariff,
  upsertChargeItem,
} from '@/server/house-settings'
import { archiveHouse, createHouse, leaveHouse, removeMember, requireViewer, updateHouse } from '@/server/houses'

// Layout (thanh dưới, danh sách nhà) giữ nguyên giữa các trang nên phải làm mới tường minh sau mỗi thay đổi.
const refreshApp = () => revalidatePath('/', 'layout')
// Cài đặt nhà chỉ hiện ở trang này; các trang đọc cấu hình (tạo tháng, hóa đơn) lấy dữ liệu mới khi mở.
const refreshSettings = () => revalidatePath('/nha')

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
    // cả nhà đã rời: chọn để xem lại lịch sử (chỉ đọc)
    await requireViewer(db, actor, houseId)
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
      if (e instanceof AppError && e.reason === 'UNPAID_PERIODS') return { archived: false, warning: e.message }
      throw e
    }
    await clearCurrentHouseCookie()
    refreshApp()
    return { archived: true }
  })
}

export async function saveChargeItemAction(
  houseId: string,
  input: { id?: string; name: string; kind: 'equal' | 'per_unit'; amount: number; active: boolean },
) {
  return runAction(async () => {
    const actor = await getActor()
    const id = await upsertChargeItem(db, actor, houseId, input)
    refreshSettings()
    return { id }
  })
}

export async function deleteChargeItemAction(itemId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await deleteChargeItem(db, actor, itemId)
    refreshSettings()
  })
}

export async function reorderChargeItemsAction(houseId: string, ids: string[]) {
  return runAction(async () => {
    const actor = await getActor()
    await reorderChargeItems(db, actor, houseId, ids)
    refreshSettings()
  })
}

export async function setMemberQtyAction(memberId: string, itemId: string, qty: number) {
  return runAction(async () => {
    const actor = await getActor()
    await setMemberQty(db, actor, memberId, itemId, qty)
    refreshSettings()
  })
}

export async function saveUtilityTariffAction(
  houseId: string,
  utility: 'electricity' | 'water',
  cfg: { mode: 'tiered' | 'total'; tariff: Tariff | null },
) {
  return runAction(async () => {
    const actor = await getActor()
    await setUtilityTariff(db, actor, houseId, utility, cfg)
    refreshSettings()
  })
}

export async function saveBankInfoAction(houseId: string, input: BankInfoInput) {
  return runAction(async () => {
    const actor = await getActor()
    await setBankInfo(db, actor, houseId, input)
    refreshSettings()
  })
}

export async function saveDueDayAction(houseId: string, dueDay: number) {
  return runAction(async () => {
    const actor = await getActor()
    await setDueDay(db, actor, houseId, dueDay)
    refreshSettings()
  })
}
