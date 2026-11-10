import { describe, expect, it } from 'vitest'
import { PROOF_MAX_BYTES, checkDeclaredLength, isProofUrlFor, proofPathPrefix, sniffImage } from './proof'

const bytes = (...b: number[]) => new Uint8Array(b)
const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

describe('sniffImage', () => {
  it('nhận JPEG, PNG, WebP, HEIC theo chữ ký đầu tệp', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('image/jpeg')
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffImage(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImage(text('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('image/heic')
  })

  it('từ chối thứ không phải ảnh: HTML, SVG, GIF, tệp rỗng', () => {
    expect(sniffImage(text('<html><script>alert(1)</script>'))).toBeNull()
    expect(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffImage(text('GIF89a......'))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe('checkDeclaredLength', () => {
  it('thiếu header, rỗng, không phải số, âm, 0, NaN, thập phân → missing (411)', () => {
    for (const h of [null, '', ' ', 'abc', '-5', '0', 'NaN', '1.5', '1e3', 'Infinity']) {
      expect(checkDeclaredLength(h)).toBe('missing')
    }
  })

  it('quá trần (1 MB + phần form) → too_large (413); trong trần → ok', () => {
    expect(checkDeclaredLength(String(PROOF_MAX_BYTES + 16 * 1024 + 1))).toBe('too_large')
    expect(checkDeclaredLength('99999999999999999999999')).toBe('too_large')
    expect(checkDeclaredLength(String(PROOF_MAX_BYTES + 16 * 1024))).toBe('ok')
    expect(checkDeclaredLength('200000')).toBe('ok')
  })
})

describe('isProofUrlFor', () => {
  const prefix = proofPathPrefix('h1', 'p1', 'm1')
  const good = `https://abc123.public.blob.vercel-storage.com/${prefix}proof-Xy12.jpg`

  it('chấp nhận ảnh đúng nhà, tháng và thành viên', () => {
    expect(isProofUrlFor(good, 'h1', 'p1', 'm1')).toBe(true)
  })

  it('từ chối thành viên, tháng, nhà khác', () => {
    expect(isProofUrlFor(good, 'h1', 'p1', 'm2')).toBe(false)
    expect(isProofUrlFor(good, 'h1', 'p2', 'm1')).toBe(false)
    expect(isProofUrlFor(good, 'h2', 'p1', 'm1')).toBe(false)
  })

  it('từ chối máy chủ lạ, http, javascript:, chuỗi không phải URL, đường dẫn thoát', () => {
    expect(isProofUrlFor(`https://evil.example.com/${prefix}a.jpg`, 'h1', 'p1', 'm1')).toBe(false)
    expect(isProofUrlFor(`https://blob.vercel-storage.com.evil.com/${prefix}a.jpg`, 'h1', 'p1', 'm1')).toBe(false)
    expect(isProofUrlFor(good.replace('https', 'http'), 'h1', 'p1', 'm1')).toBe(false)
    expect(isProofUrlFor('javascript:alert(1)', 'h1', 'p1', 'm1')).toBe(false)
    expect(isProofUrlFor('không phải url', 'h1', 'p1', 'm1')).toBe(false)
    expect(isProofUrlFor(`https://a.public.blob.vercel-storage.com/${prefix}../../x`, 'h1', 'p1', 'm1')).toBe(false)
  })
})
