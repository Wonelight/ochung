'use server'

import { cookies } from 'next/headers'
import { INSTALL_GUIDE_COOKIE } from '@/lib/install-guide'

const ONE_YEAR = 60 * 60 * 24 * 365

/** Tắt hướng dẫn "Thêm vào Màn hình chính" ở Trang chủ trên thiết bị này, không hiện lại (cookie một năm). */
export async function dismissInstallGuideAction(): Promise<void> {
  ;(await cookies()).set(INSTALL_GUIDE_COOKIE, '1', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR,
  })
}
