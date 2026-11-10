import { describe, expect, it } from 'vitest'
import { AppError } from './errors'
import { buildVietQrPayload, crc16, transferNote } from './vietqr'

// Vector đối chiếu: ba chuỗi VietQR in trong bài "Tự viết bộ tạo và đọc mã VietQR bằng JavaScript"
// (https://viblo.asia/p/tu-viet-bo-tao-va-doc-ma-vietqr-bang-javascript-tlv-crc16-va-6-loi-hay-gap-3RL1BowpVao),
// chuỗi tĩnh cũng có trong gói pub.dev `vietqr_gen`. Đây là chuỗi do một cài đặt độc lập sinh ra, chưa quét bằng app
// ngân hàng thật; CRC trong đó được tính lại bằng crc16 của ta và phải khớp từng ký tự.
const DYNAMIC_150K = '00020101021238540010A00000072701240006970423011001234567890208QRIBFTTA530370454061500005802VN62120808DH123456630479AB'
const DYNAMIC_50K = '00020101021238530010A000000727012300069704230109mynamebvh0208QRIBFTTA53037045405500005802VN62080804test6304AB76'
const STATIC = '00020101021138540010A00000072701240006970407011096020919960208QRIBFTTA53037045802VN630434A0'

const crcOf = (payload: string) => crc16(payload.slice(0, -4))

describe('crc16', () => {
  it('CRC-16/CCITT-FALSE: check value của "123456789" là 29B1', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('khớp CRC của các chuỗi VietQR tham chiếu', () => {
    expect(crcOf(DYNAMIC_150K)).toBe('79AB')
    expect(crcOf(DYNAMIC_50K)).toBe('AB76')
    expect(crcOf(STATIC)).toBe('34A0')
  })
})

describe('buildVietQrPayload', () => {
  it('trùng đúng chuỗi tham chiếu (BIN 970423, tài khoản 0123456789, 150.000, DH123456)', () => {
    expect(buildVietQrPayload({ bankBin: '970423', accountNo: '0123456789', amount: 150_000, addInfo: 'DH123456' })).toBe(DYNAMIC_150K)
  })

  it('trùng chuỗi tham chiếu thứ hai (tài khoản chữ, 50.000, "test")', () => {
    // Tài khoản "mynamebvh" không hợp lệ với số tài khoản thật nên chỉ kiểm tra độ dài trường qua chuỗi số tương đương.
    const p = buildVietQrPayload({ bankBin: '970423', accountNo: '123456789', amount: 50_000, addInfo: 'test' })
    expect(p).toContain('0109123456789')
    expect(crcOf(p)).toBe(p.slice(-4))
  })

  it('cấu trúc: tĩnh/động, chuyển vào tài khoản, VND, quốc gia, số tiền 2.600.000', () => {
    const p = buildVietQrPayload({ bankBin: '970436', accountNo: '0011001234567', amount: 2_600_000, addInfo: 'AN T11' })
    expect(p.startsWith('000201')).toBe(true)
    expect(p.startsWith('00020101021238')).toBe(true) // 01 = "12": mã động có số tiền
    expect(p).toContain('0010A000000727')
    expect(p).toContain('0208QRIBFTTA')
    expect(p).toContain('5303704')
    expect(p).toContain('54072600000') // trường 54 = '2600000' (độ dài 07)
    expect(p).toContain('5802VN')
    expect(p).toContain('0806AN T11') // 62 > 08
    expect(p).toMatch(/6304[0-9A-F]{4}$/)
    expect(crcOf(p)).toBe(p.slice(-4))
  })

  it('thứ tự trường đúng: 00, 01, 38, 53, 54, 58, 62, 63', () => {
    const p = buildVietQrPayload({ bankBin: '970436', accountNo: '0011001234567', amount: 1000, addInfo: 'AN T11' })
    const order = [p.indexOf('000201'), p.indexOf('010212'), p.indexOf('38'), p.indexOf('5303704'), p.indexOf('5404'), p.indexOf('5802VN'), p.indexOf('62'), p.indexOf('6304')]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('từ chối đầu vào sai: BIN, số tài khoản, số tiền, nội dung', () => {
    const ok = { bankBin: '970436', accountNo: '0011001234567', amount: 1000, addInfo: 'AN T11' }
    for (const bad of [
      { ...ok, bankBin: '97043' },
      { ...ok, accountNo: '12 34' },
      { ...ok, amount: 0 },
      { ...ok, amount: -5 },
      { ...ok, amount: 1.5 },
      { ...ok, addInfo: 'x'.repeat(26) },
      { ...ok, addInfo: 'Đ' },
    ]) {
      expect(() => buildVietQrPayload(bad)).toThrow(AppError)
    }
  })
})

describe('transferNote', () => {
  it('bỏ dấu, viết hoa, thêm " T<tháng>"', () => {
    expect(transferNote('Nguyễn Văn An', { year: 2026, month: 11 })).toBe('NGUYEN VAN AN T11')
    expect(transferNote('An', { year: 2026, month: 11 })).toBe('AN T11')
    expect(transferNote('Đặng  Thị   Ơn', { year: 2026, month: 3 })).toBe('DANG THI ON T3')
  })

  it('dài quá 25 ký tự thì cắt phần tên, giữ hậu tố tháng', () => {
    const note = transferNote('Nguyễn Thị Phương Thảo Nguyên', { year: 2026, month: 12 })
    expect(note.length).toBeLessThanOrEqual(25)
    expect(note.endsWith(' T12')).toBe(true)
    expect(note).toBe('NGUYEN THI PHUONG THA T12')
  })

  it('tên rỗng hoặc chỉ ký hiệu vẫn cho nội dung hợp lệ', () => {
    expect(transferNote('  ', { year: 2026, month: 11 })).toBe('T11')
    expect(transferNote('A@#$ B!', { year: 2026, month: 11 })).toBe('A B T11')
  })
})
