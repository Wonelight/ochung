import { getHouseContext } from '@/server/current-house'
import { HouseSwitcherMenu } from './HouseSwitcherMenu'

/** "Tên nhà ▾" ở đầu trang: các trang đặt vào đầu trang của mình; nhà lấy từ cookie `house`. */
export async function HouseSwitcher() {
  const { houses, current } = await getHouseContext()
  if (!current) return null
  return <HouseSwitcherMenu houses={houses} currentId={current.houseId} />
}
