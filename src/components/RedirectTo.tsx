'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Chuyển trang phía client. Dùng thay `redirect()` ở layout khi layout dựng lại ngay sau một server action
 * (vd lưu trữ nhà cuối cùng): `redirect()` trong lần dựng lại đó làm router của Next gọi lại liên tục.
 */
export function RedirectTo({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(href)
  }, [router, href])
  return null
}
