import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { AppError, type AppErrorCode } from '@/lib/errors'
import { EXTENSION, PROOF_MAX_BYTES, checkDeclaredLength, proofPathPrefix, sniffImage } from '@/lib/proof'
import { getActor } from '@/server/actor'
import { authorizeProofUpload } from '@/server/payments'

// Tải ảnh chứng từ chuyển khoản lên Vercel Blob. Là route handler (không phải server action) vì server action giới hạn thân
// yêu cầu 1 MB mặc định, trùng đúng trần của ảnh. Layout không bảo vệ route handler và proxy chỉ kiểm "có cookie", nên
// hàm này tự xác thực bằng getActor() và kiểm quyền thành viên của nhà (authorizeProofUpload) trước khi nhận tệp.
// Ảnh nén ở trình duyệt (cạnh dài nhất 1280px, JPEG ~0,8); server chỉ kiểm tra lại trần 1 MB và loại ảnh theo nội dung.

export const runtime = 'nodejs'

const STATUS: Record<AppErrorCode, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, CONFLICT: 409 }
const fail = (status: number, message: string) => NextResponse.json({ message }, { status })

export async function POST(request: Request) {
  try {
    const actor = await getActor()
    if (!process.env.BLOB_READ_WRITE_TOKEN) return fail(501, 'Chưa bật tính năng đính kèm ảnh')

    // Chặn trước khi đọc thân: bắt buộc có Content-Length hợp lệ (thiếu/không phải số/≤ 0 → 411) và không quá trần (→ 413),
    // nếu không formData() sẽ nạp cả thân yêu cầu vào bộ nhớ rồi mới kiểm file.size.
    const declared = checkDeclaredLength(request.headers.get('content-length'))
    if (declared === 'missing') return fail(411, 'Yêu cầu thiếu độ dài nội dung')
    if (declared === 'too_large') return fail(413, 'Ảnh quá lớn (tối đa 1 MB)')

    const form = await request.formData()
    const file = form.get('file')
    const periodId = form.get('periodId')
    if (!(file instanceof File) || typeof periodId !== 'string' || periodId === '' || periodId.length > 64) {
      return fail(400, 'Thiếu ảnh hoặc tháng cần đính kèm')
    }
    if (file.size === 0) return fail(400, 'Ảnh trống')
    if (file.size > PROOF_MAX_BYTES) return fail(413, 'Ảnh quá lớn (tối đa 1 MB)')

    const { houseId, memberId } = await authorizeProofUpload(db, actor, periodId)
    const type = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
    if (!type) return fail(400, 'Chỉ nhận ảnh JPEG, PNG, WebP hoặc HEIC')

    const blob = await put(`${proofPathPrefix(houseId, periodId, memberId)}proof.${EXTENSION[type]}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: type,
    })
    return NextResponse.json({ url: blob.url })
  } catch (e) {
    if (e instanceof AppError) return fail(STATUS[e.code], e.message)
    console.error(e)
    return fail(500, 'Không tải ảnh lên được, vui lòng thử lại')
  }
}
