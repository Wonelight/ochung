'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { acceptInviteAction } from '@/app/(app)/vao-nha/actions'

/** Tự vào nhà ngay khi mở link; lỗi thì hiện câu tiếng Việt kèm đường về trang chủ hoặc nhập mã nhà. */
export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // chỉ chạy một lần (Strict Mode gọi effect hai lần khi dev)
    if (started.current) return
    started.current = true
    acceptInviteAction(token).then(
      (res) => {
        if (!res.ok) return setError(res.message)
        router.replace('/')
        router.refresh()
      },
      () => setError('Không kết nối được. Hãy kiểm tra mạng rồi mở lại link'),
    )
  }, [token, router])

  return (
    <section className="mx-5 flex flex-col gap-3.5 rounded-[24px] border border-line bg-card p-5">
      {error ? (
        <>
          <h1 className="m-0 text-[20px] font-bold">Chưa vào được nhà</h1>
          <p role="alert" className="m-0 text-[14px] leading-normal text-muted">
            {error}
          </p>
          <Link
            href="/vao-nha"
            className="flex h-[54px] items-center justify-center rounded-[27px] bg-accent text-[16px] font-bold text-[#1A0F06] no-underline"
          >
            Vào nhà bằng mã
          </Link>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-[24px] border border-line2 text-[15px] font-semibold text-text no-underline"
          >
            Về trang chủ
          </Link>
        </>
      ) : (
        <>
          <h1 className="m-0 text-[20px] font-bold">Đang vào nhà…</h1>
          <p role="status" className="m-0 text-[14px] leading-normal text-muted">
            Chờ một chút, bạn sẽ được chuyển vào nhà ngay.
          </p>
        </>
      )}
    </section>
  )
}
