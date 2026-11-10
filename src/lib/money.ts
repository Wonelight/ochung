// Tiền là số nguyên đồng. Định dạng tự viết, không phụ thuộc Intl/locale của máy.

/** 2600000 -> "2.600.000"; -171428 -> "-171.428". Không gồm hậu tố "đ". */
export function formatVnd(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Số tiền phải là số nguyên đồng: ${amount}`)
  }
  const sign = amount < 0 ? '-' : ''
  const digits = String(Math.abs(amount))
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const GROUPED = /^-?\d{1,3}(\.\d{3})+$/
const PLAIN = /^-?\d+$/

/**
 * "2.600.000" / "2600000đ" -> 2600000. Trả null nếu không phải số nguyên đồng hợp lệ
 * (chữ, rỗng, số lẻ như "1,5", nhóm nghìn sai như "1.5").
 */
export function parseVnd(input: string): number | null {
  const s = input.replace(/\s+/g, '').replace(/[đĐ]$/, '')
  if (!GROUPED.test(s) && !PLAIN.test(s)) return null
  const n = Number(s.replace(/\./g, ''))
  return Number.isSafeInteger(n) ? n : null
}
