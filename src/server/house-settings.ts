import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm'
import type { Db } from '@/db'
import { newId } from '@/db/ids'
import { chargeItems, houseMembers, houses, memberChargeQty, utilityTariffs } from '@/db/schema'
import type { Tariff } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import { chargeItemSchema, parseBankInfo, parseOrThrow, qtySchema, tariffSchema, type BankInfoInput } from '@/lib/validation'
import type { Actor } from './actor'
import { DEFAULT_TARIFF, requireMember, requireOwner, updateHouse } from './houses'
import { syncDraftPeriods } from './periods'

// Mọi hàm ghi chạy trong một `db.transaction`, kiểm quyền ngay trong đó bằng `requireOwner(tx, …)`, và kết thúc bằng
// `syncDraftPeriods(tx, houseId)` để các tháng nháp nhận cấu hình mới (tháng đã chốt không đổi).

export type Utility = 'electricity' | 'water'
export type UtilityConfig = { mode: 'tiered' | 'total'; tariff: Tariff }

export type ChargeItemRow = {
  id: string
  name: string
  kind: 'equal' | 'per_unit'
  /** equal: tổng cả tháng; per_unit: đơn giá. */
  amount: number
  sortOrder: number
  active: boolean
}

export type HouseSettings = {
  items: ChargeItemRow[]
  qty: { memberId: string; itemId: string; qty: number }[]
  tariffs: Record<Utility, UtilityConfig>
  bank: { bankBin: string | null; accountNo: string | null; accountName: string | null }
  dueDay: number
}

const itemNotFound = () => new AppError('NOT_FOUND', 'ITEM_NOT_FOUND', 'Không tìm thấy khoản này')

/**
 * Thêm (không có `id`) hoặc sửa khoản cố định, trả về id. Khoản mới xếp cuối danh sách.
 * `active: false` nghĩa là khoản bị gỡ: nó biến mất khỏi danh sách cài đặt (xem `deleteChargeItem`).
 */
export async function upsertChargeItem(
  db: Db,
  actor: Actor,
  houseId: string,
  input: { id?: string; name: string; kind: 'equal' | 'per_unit'; amount: number; active: boolean },
): Promise<string> {
  return db.transaction(async (tx) => {
    await requireOwner(tx, actor, houseId)
    const { id, ...rest } = input
    const data = parseOrThrow(chargeItemSchema, rest, 'CHARGE_ITEM')
    if (id !== undefined) {
      const [row] = await tx
        .select({ id: chargeItems.id })
        .from(chargeItems)
        .where(and(eq(chargeItems.id, id), eq(chargeItems.houseId, houseId), eq(chargeItems.active, true)))
        .limit(1)
      if (!row) throw itemNotFound()
      await tx.update(chargeItems).set(data).where(eq(chargeItems.id, id))
      await syncDraftPeriods(tx, houseId)
      return id
    }
    const [last] = await tx.select({ top: max(chargeItems.sortOrder) }).from(chargeItems).where(eq(chargeItems.houseId, houseId))
    const newItemId = newId()
    await tx.insert(chargeItems).values({ id: newItemId, houseId, ...data, sortOrder: (last?.top ?? -1) + 1 })
    await syncDraftPeriods(tx, houseId)
    return newItemId
  })
}

/**
 * Xóa mềm: đặt `active = false` thay vì xóa dòng. Các tháng thu (Task 11) sao chép khoản này vào bản chụp
 * của từng tháng, nên dòng gốc phải còn để lịch sử không mất; khoản đã gỡ không hiện ở cài đặt và không vào tháng nháp mới.
 */
export async function deleteChargeItem(db: Db, actor: Actor, itemId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ houseId: chargeItems.houseId, active: chargeItems.active })
      .from(chargeItems)
      .where(eq(chargeItems.id, itemId))
      .limit(1)
    if (!item) throw itemNotFound()
    await requireOwner(tx, actor, item.houseId)
    if (!item.active) throw itemNotFound()
    await tx.update(chargeItems).set({ active: false }).where(eq(chargeItems.id, itemId))
    await syncDraftPeriods(tx, item.houseId)
  })
}

/** `ids` phải đúng là tập các khoản đang dùng của nhà, mỗi khoản một lần; thứ tự trong mảng là thứ tự mới. */
export async function reorderChargeItems(db: Db, actor: Actor, houseId: string, ids: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await requireOwner(tx, actor, houseId)
    const current = await tx
      .select({ id: chargeItems.id })
      .from(chargeItems)
      .where(and(eq(chargeItems.houseId, houseId), eq(chargeItems.active, true)))
    const known = new Set(current.map((r) => r.id))
    if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
      throw new AppError('INVALID', 'REORDER_SET', 'Danh sách khoản không khớp, hãy tải lại trang rồi thử lại')
    }
    for (const [index, id] of ids.entries()) {
      await tx.update(chargeItems).set({ sortOrder: index }).where(eq(chargeItems.id, id))
    }
    await syncDraftPeriods(tx, houseId)
  })
}

/** Đặt số lượng (ví dụ số xe) của một thành viên cho một khoản "theo người". Thành viên và khoản phải cùng nhà. */
export async function setMemberQty(db: Db, actor: Actor, memberId: string, itemId: string, qty: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ houseId: chargeItems.houseId, kind: chargeItems.kind, active: chargeItems.active })
      .from(chargeItems)
      .where(eq(chargeItems.id, itemId))
      .limit(1)
    if (!item) throw itemNotFound()
    await requireOwner(tx, actor, item.houseId)
    if (!item.active) throw itemNotFound()
    if (item.kind !== 'per_unit') throw new AppError('INVALID', 'NOT_PER_UNIT', 'Khoản này chia đều nên không có số lượng theo người')
    const value = parseOrThrow(qtySchema, qty, 'QTY')
    const [member] = await tx
      .select({ houseId: houseMembers.houseId, leftAt: houseMembers.leftAt })
      .from(houseMembers)
      .where(eq(houseMembers.id, memberId))
      .limit(1)
    if (!member || member.leftAt) throw new AppError('NOT_FOUND', 'MEMBER_NOT_FOUND', 'Không tìm thấy thành viên')
    if (member.houseId !== item.houseId) throw new AppError('FORBIDDEN', 'CROSS_HOUSE', 'Thành viên không thuộc nhà này')
    await tx
      .insert(memberChargeQty)
      .values({ memberId, itemId, qty: value })
      .onConflictDoUpdate({ target: [memberChargeQty.memberId, memberChargeQty.itemId], set: { qty: value } })
    await syncDraftPeriods(tx, item.houseId)
  })
}

/**
 * Lưu chế độ và bảng giá điện/nước. `mode: 'tiered'` bắt buộc có `tariff` hợp lệ (`tariffSchema`).
 * `mode: 'total'` với `tariff: null` chỉ đổi chế độ và GIỮ NGUYÊN bảng giá đang lưu, để chuyển lại "Theo bậc"
 * chủ nhà vẫn còn bảng đã cài; có `tariff` thì vẫn kiểm tra rồi lưu (cho phép soạn bảng giá khi đang ở "Nhập tổng").
 */
export async function setUtilityTariff(
  db: Db,
  actor: Actor,
  houseId: string,
  utility: Utility,
  cfg: { mode: 'tiered' | 'total'; tariff: Tariff | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireOwner(tx, actor, houseId)
    if (utility !== 'electricity' && utility !== 'water') throw new AppError('INVALID', 'UTILITY', 'Loại tiện ích không hợp lệ')
    if (cfg.mode !== 'tiered' && cfg.mode !== 'total') throw new AppError('INVALID', 'MODE', 'Chế độ không hợp lệ')
    if (cfg.mode === 'tiered' && !cfg.tariff) {
      throw new AppError('INVALID', 'TARIFF_REQUIRED', 'Chế độ "Theo bậc" cần có bảng giá')
    }
    const tariff = cfg.tariff ? parseOrThrow(tariffSchema, cfg.tariff, 'TARIFF') : null
    if (tariff) {
      await tx
        .insert(utilityTariffs)
        .values({ houseId, utility, mode: cfg.mode, tariff })
        .onConflictDoUpdate({ target: [utilityTariffs.houseId, utilityTariffs.utility], set: { mode: cfg.mode, tariff } })
    } else {
      await tx
        .insert(utilityTariffs)
        .values({ houseId, utility, mode: cfg.mode, tariff: DEFAULT_TARIFF })
        .onConflictDoUpdate({ target: [utilityTariffs.houseId, utilityTariffs.utility], set: { mode: cfg.mode } })
    }
    await syncDraftPeriods(tx, houseId)
  })
}

/** Ngân hàng nhận tiền: đủ ba trường hợp lệ (BIN trong `BANKS`, số tài khoản 6–19 chữ số, tên viết hoa không dấu ≤ 50) hoặc cả ba null để xóa. */
export async function setBankInfo(db: Db, actor: Actor, houseId: string, input: BankInfoInput): Promise<void> {
  await db.transaction(async (tx) => {
    await requireOwner(tx, actor, houseId)
    const info = parseBankInfo(input)
    await updateHouse(tx, actor, houseId, {
      bankBin: info?.bankBin ?? null,
      bankAccountNo: info?.accountNo ?? null,
      bankAccountName: info?.accountName ?? null,
    })
    await syncDraftPeriods(tx, houseId)
  })
}

/** Hạn đóng là ngày 1–28 hằng tháng (kiểm tra trong `updateHouse`). */
export async function setDueDay(db: Db, actor: Actor, houseId: string, dueDay: number): Promise<void> {
  await db.transaction(async (tx) => {
    await updateHouse(tx, actor, houseId, { dueDay })
    await syncDraftPeriods(tx, houseId)
  })
}

/** Cài đặt của nhà cho mọi thành viên xem (chỉ chủ nhà sửa được). Khoản đã gỡ không có trong kết quả. */
export async function getHouseSettings(db: Db, actor: Actor, houseId: string): Promise<HouseSettings> {
  await requireMember(db, actor, houseId)
  const [house] = await db.select().from(houses).where(eq(houses.id, houseId)).limit(1)
  if (!house) throw new AppError('NOT_FOUND', 'HOUSE_NOT_FOUND', 'Không tìm thấy nhà')

  const items = await db
    .select()
    .from(chargeItems)
    .where(and(eq(chargeItems.houseId, houseId), eq(chargeItems.active, true)))
    .orderBy(asc(chargeItems.sortOrder), asc(chargeItems.id))
  const itemIds = items.map((i) => i.id)
  const qty = itemIds.length
    ? await db
        .select({ memberId: memberChargeQty.memberId, itemId: memberChargeQty.itemId, qty: memberChargeQty.qty })
        .from(memberChargeQty)
        .innerJoin(houseMembers, eq(houseMembers.id, memberChargeQty.memberId))
        .where(and(inArray(memberChargeQty.itemId, itemIds), isNull(houseMembers.leftAt)))
        .orderBy(asc(memberChargeQty.itemId), asc(memberChargeQty.memberId))
    : []

  const rows = await db.select().from(utilityTariffs).where(eq(utilityTariffs.houseId, houseId))
  const pick = (u: Utility): UtilityConfig => {
    const row = rows.find((r) => r.utility === u)
    return row ? { mode: row.mode, tariff: row.tariff } : { mode: 'total', tariff: DEFAULT_TARIFF }
  }

  return {
    items,
    qty,
    tariffs: { electricity: pick('electricity'), water: pick('water') },
    bank: { bankBin: house.bankBin, accountNo: house.bankAccountNo, accountName: house.bankAccountName },
    dueDay: house.dueDay,
  }
}
