'use client'

import { useEffect } from 'react'
import { markAllReadAction } from '../actions'

/** Mở trang Thông báo là đánh dấu đã đọc hết. Không làm mới trang: các thông báo vừa mở vẫn hiện nổi bật cho tới lần mở sau. */
export function MarkAllRead({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (hasUnread) void markAllReadAction()
  }, [hasUnread])
  return null
}
