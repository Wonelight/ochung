import type { YM } from './billing/types'
import { AppError } from './errors'
import { MAX_MONEY } from './validation'

// Mã QR VietQR (NAPAS 247, chuyển vào tài khoản) theo EMVCo Merchant-Presented Mode: chuỗi TLV, mỗi trường là
// <id 2 chữ số><độ dài 2 chữ số><giá trị>. Tự cài đặt vì chỉ cần đúng một dạng mã động có sẵn số tiền.

const NOTE_MAX = 25
const GUID = 'A000000727'
const SERVICE = 'QRIBFTTA' // chuyển nhanh vào tài khoản

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new AppError('INVALID', 'QR_FIELD', 'Dữ liệu mã QR quá dài')
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit) trên chuỗi ASCII; trả 4 ký tự hex VIẾT HOA. */
export function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export type VietQrInput = { bankBin: string; accountNo: string; amount: number; addInfo: string }

/**
 * Chuỗi nội dung của mã QR: 00 phiên bản, 01 = "12" (mã động, có số tiền), 38 thông tin người nhận
 * (GUID A000000727 + [BIN, số tài khoản] + dịch vụ QRIBFTTA), 53 = "704" (VND), 54 số tiền, 58 = "VN",
 * 62 > 08 nội dung chuyển khoản, 63 CRC tính trên toàn bộ chuỗi tính cả "6304".
 * Nội dung tối đa 25 ký tự ASCII; không có nội dung thì bỏ trường 62.
 */
export function buildVietQrPayload(i: VietQrInput): string {
  if (!/^\d{6}$/.test(i.bankBin)) throw new AppError('INVALID', 'QR_BANK', 'Mã ngân hàng không hợp lệ')
  if (!/^\d{4,19}$/.test(i.accountNo)) throw new AppError('INVALID', 'QR_ACCOUNT', 'Số tài khoản không hợp lệ')
  if (!Number.isSafeInteger(i.amount) || i.amount <= 0 || i.amount > MAX_MONEY) {
    throw new AppError('INVALID', 'AMOUNT_INVALID', 'Số tiền phải là số nguyên đồng lớn hơn 0')
  }
  if (!/^[\x20-\x7E]*$/.test(i.addInfo) || i.addInfo.length > NOTE_MAX) {
    throw new AppError('INVALID', 'QR_NOTE', `Nội dung chuyển khoản tối đa ${NOTE_MAX} ký tự không dấu`)
  }
  const beneficiary = tlv('00', i.bankBin) + tlv('01', i.accountNo)
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', tlv('00', GUID) + tlv('01', beneficiary) + tlv('02', SERVICE)) +
    tlv('53', '704') +
    tlv('54', String(i.amount)) +
    tlv('58', 'VN') +
    (i.addInfo ? tlv('62', tlv('08', i.addInfo)) : '') +
    '6304'
  return body + crc16(body)
}

/**
 * Nội dung chuyển khoản: tên không dấu viết hoa + " T<tháng>" (vd `NGUYEN VAN AN T11`), tối đa 25 ký tự.
 * Dài quá thì cắt phần tên, giữ hậu tố tháng. Ký tự ngoài chữ số và chữ cái thành khoảng trắng.
 */
export function transferNote(displayName: string, ym: YM): string {
  const suffix = `T${ym.month}`
  const name = displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
  const room = NOTE_MAX - suffix.length - 1
  const cut = name.slice(0, room).trim()
  return cut ? `${cut} ${suffix}` : suffix
}
