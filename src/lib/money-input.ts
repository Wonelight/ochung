import { formatVnd, parseVnd } from './money'

/** 99.999.999.999 đ: dưới trần tiền hợp lệ của server (100 tỷ) nên gõ tới đâu cũng không bị từ chối. */
const MAX_DIGITS = 11

/**
 * Chuẩn hóa chuỗi người dùng gõ vào ô tiền: chỉ giữ chữ số (dấu "." là phân cách nghìn nên bị bỏ),
 * phần sau dấu "," bị cắt (không nhận số lẻ), bỏ số 0 đầu, tối đa 11 chữ số.
 */
export function readMoneyInput(raw: string): number | null {
  const digits = raw.split(',')[0].replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS)
  return digits === '' ? null : parseVnd(digits)
}

/** 2600000 -> "2.600.000"; null -> "". */
export function showMoneyInput(value: number | null): string {
  return value === null ? '' : formatVnd(value)
}

/** Vị trí con trỏ trong `text` sau chữ số thứ `digits` (để giữ con trỏ khi chèn dấu nghìn lúc gõ). */
export function caretAfterDigits(text: string, digits: number): number {
  if (digits <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) seen++
    if (seen === digits) return i + 1
  }
  return text.length
}
