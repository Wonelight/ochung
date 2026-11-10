import QRCode from 'qrcode'
import { db } from '@/db'
import type { PayCta } from '@/components/QrSheet'
import { findBank } from '@/lib/banks'
import type { PaymentStatus } from '@/lib/billing/types'
import { buildVietQrPayload, transferNote } from '@/lib/vietqr'
import type { Actor } from '@/server/actor'
import { getHouse } from '@/server/houses'
import { getPaymentDetails } from '@/server/payments'

/** Có token Vercel Blob thì mới có ô đính kèm ảnh chứng từ (dev cục bộ và e2e không có). */
export const uploadEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN)

/**
 * Dữ liệu cho nút/tấm "Mã QR" của thành viên đang xem phiếu của CHÍNH MÌNH. Null khi không còn gì phải chuyển
 * (đã trả đủ, chủ nhà nợ, nhà đã lưu trữ). Mã QR sinh ở server và gửi xuống dạng ảnh SVG nên trình duyệt không phải tải thư viện.
 */
export async function loadPayCta(a: {
  actor: Actor
  houseId: string
  period: { id: string; year: number; month: number }
  memberName: string
  status: PaymentStatus | undefined
}): Promise<PayCta | null> {
  const { status } = a
  if (!status || status.balance <= 0) return null
  const house = await getHouse(db, a.actor, a.houseId)
  if (house.archived) return null

  const note = transferNote(a.memberName, a.period)
  const bank = findBank(house.bankBin)
  let qrImage: string | null = null
  if (bank && house.bankAccountNo && house.bankAccountName) {
    try {
      const payload = buildVietQrPayload({ bankBin: bank.bin, accountNo: house.bankAccountNo, amount: status.balance, addInfo: note })
      const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#ffffff' } })
      qrImage = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    } catch (e) {
      // dữ liệu ngân hàng không dựng được mã: ghi log để biết, vẫn hiện thông tin chuyển tay và không làm hỏng trang
      console.error(`Không tạo được mã VietQR (nhà ${a.houseId}, tháng ${a.period.id})`, e)
      qrImage = null
    }
  }

  // getPaymentDetails chỉ trả bản ghi của chính thành viên này; mới nhất trước
  const mine = (await getPaymentDetails(db, a.actor, a.period.id)).filter((r) => r.direction === 'in')
  const pending = mine.some((r) => r.status === 'pending')
  const latest = mine[0]
  return {
    periodId: a.period.id,
    monthLabel: `T${a.period.month}`,
    amount: status.balance,
    note,
    bank: bank && house.bankAccountNo && house.bankAccountName ? { name: bank.short, accountNo: house.bankAccountNo, accountName: house.bankAccountName } : null,
    qrImage,
    bankUnsupported: !bank && Boolean(house.bankBin),
    uploadEnabled: uploadEnabled(),
    pending,
    rejectedReason: !pending && latest?.status === 'rejected' ? latest.rejectReason : null,
  }
}
