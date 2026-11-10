// Ảnh chứng từ chuyển khoản: nhận dạng loại ảnh theo nội dung (không tin Content-Type của client) và kiểm tra địa chỉ ảnh
// chỉ thuộc về đúng nhà, tháng và thành viên (chống gắn địa chỉ tùy ý vào bản ghi thanh toán).

export const PROOF_MAX_BYTES = 1024 * 1024
/** Phần thân form ngoài ảnh (tên trường, periodId, biên multipart). */
const FORM_OVERHEAD_BYTES = 16 * 1024

/** Kiểm giá trị header Content-Length của yêu cầu tải ảnh: thiếu / không phải số nguyên dương → 'missing'; quá trần → 'too_large'. */
export function checkDeclaredLength(header: string | null): 'ok' | 'missing' | 'too_large' {
  if (header === null || !/^\d+$/.test(header.trim())) return 'missing'
  const n = Number(header)
  if (n <= 0) return 'missing'
  return !Number.isSafeInteger(n) || n > PROOF_MAX_BYTES + FORM_OVERHEAD_BYTES ? 'too_large' : 'ok'
}

export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
export type ProofType = (typeof PROOF_TYPES)[number]

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to))

/** Loại ảnh theo chữ ký đầu tệp; null nếu không phải JPEG, PNG, WebP hoặc HEIC/HEIF. */
export function sniffImage(bytes: Uint8Array): ProofType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'image/png'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(bytes, 8, 12))) return 'image/heic'
  return null
}

export const EXTENSION: Record<ProofType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

/** Tiền tố đường dẫn Blob của ảnh chứng từ của một thành viên trong một tháng. */
export function proofPathPrefix(houseId: string, periodId: string, memberId: string): string {
  return `proofs/${houseId}/${periodId}/${memberId}-`
}

/**
 * Địa chỉ ảnh hợp lệ cho bản ghi thanh toán: https, máy chủ Vercel Blob, và đường dẫn đúng tiền tố
 * `proofs/<nhà>/<tháng>/<thành viên>-`. Địa chỉ ảnh là chuỗi ngẫu nhiên khó đoán (addRandomSuffix).
 */
export function isProofUrlFor(url: string, houseId: string, periodId: string, memberId: string): boolean {
  if (url.length > 500) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.blob.vercel-storage.com')) return false
  let path: string
  try {
    path = decodeURIComponent(u.pathname).replace(/^\//, '')
  } catch {
    return false
  }
  return path.startsWith(proofPathPrefix(houseId, periodId, memberId)) && !path.includes('..')
}
