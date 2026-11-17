'use client'

import { useCallback, useEffect, useState } from 'react'

/** Đếm ngược theo giây cho nút "Gửi lại mã" (máy chủ giới hạn 3 lần gửi mỗi phút, nên chờ 60 giây giữa hai lần). */
export function useCooldown(initial = 0): [remaining: number, start: (seconds: number) => void] {
  const [remaining, setRemaining] = useState(initial)
  useEffect(() => {
    if (remaining <= 0) return
    const t = window.setTimeout(() => setRemaining((v) => v - 1), 1000)
    return () => window.clearTimeout(t)
  }, [remaining])
  const start = useCallback((seconds: number) => setRemaining(seconds), [])
  return [remaining, start]
}
