import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/db'
import { getActor } from './actor'
import { listMyHouses, type HouseSummary } from './houses'

export const HOUSE_COOKIE = 'house'
const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Nhà đang chọn: nhà trong cookie nếu người dùng còn là thành viên (kể cả nhà đã lưu trữ, để xem lịch sử),
 * không thì nhà đang dùng đầu tiên (danh sách đã xếp nhà đang dùng trước), không có thì null.
 */
export function resolveCurrentHouse(houses: HouseSummary[], cookieValue: string | undefined): HouseSummary | null {
  const chosen = cookieValue ? houses.find((h) => h.houseId === cookieValue) : undefined
  return chosen ?? houses.find((h) => !h.archived) ?? null
}

/** Actor, các nhà của người dùng và nhà đang chọn; gộp trong một request (layout và trang dùng chung kết quả). */
export const getHouseContext = cache(async () => {
  const actor = await getActor()
  const houses = await listMyHouses(db, actor)
  const current = resolveCurrentHouse(houses, (await cookies()).get(HOUSE_COOKIE)?.value)
  return { actor, houses, current }
})

/** Chỉ gọi trong server action hoặc route handler (layout/trang không được ghi cookie). */
export async function setCurrentHouseCookie(houseId: string) {
  ;(await cookies()).set(HOUSE_COOKIE, houseId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR,
  })
}

export async function clearCurrentHouseCookie() {
  ;(await cookies()).delete(HOUSE_COOKIE)
}

/**
 * Cho trang cần một nhà: chưa có nhà đang dùng thì chuyển sang /nha/moi (Task 9 đổi sang /vao-nha).
 * Gọi từ trang, không gọi từ layout: layout dùng chung giữa các trang và không dựng lại khi chuyển trang mềm.
 * /nha/moi không được gọi hàm này (tránh vòng lặp).
 */
export async function requireCurrentHouse() {
  const ctx = await getHouseContext()
  if (!ctx.current) redirect('/nha/moi')
  return { ...ctx, current: ctx.current }
}
