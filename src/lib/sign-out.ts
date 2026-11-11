import { authClient } from './auth-client'
import { detachPushSubscription } from './push-client'

/**
 * Đăng xuất phía trình duyệt. Gỡ subscription web push của thiết bị TRƯỚC khi hủy phiên (cần cookie phiên để máy chủ xóa nó):
 * thông báo có số tiền không được tiếp tục tới thiết bị mà người khác sắp dùng.
 */
export async function signOutClient(): Promise<void> {
  await detachPushSubscription()
  await authClient.signOut()
}
