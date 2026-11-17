import { describe, expect, it } from 'vitest'
import { looksLikeEmail, normalizeEmailInput, otpErrorMessage } from './otp-errors'

describe('otpErrorMessage', () => {
  it('mỗi mã lỗi OTP có câu hướng dẫn riêng', () => {
    expect(otpErrorMessage({ code: 'INVALID_OTP' })).toMatch(/không đúng/)
    expect(otpErrorMessage({ code: 'OTP_EXPIRED' })).toMatch(/hết hạn/)
    expect(otpErrorMessage({ code: 'TOO_MANY_ATTEMPTS' })).toMatch(/quá nhiều lần/)
  })
  it('429 là thử quá nhiều lần, lỗi lạ có câu chung', () => {
    expect(otpErrorMessage({ status: 429 })).toMatch(/đợi/)
    expect(otpErrorMessage({ code: 'GÌ_ĐÓ' })).toMatch(/thử lại/)
  })
})

describe('email nhập tay', () => {
  it('chuẩn hóa và nhận dạng sơ bộ', () => {
    expect(normalizeEmailInput('  Minh@Example.COM ')).toBe('minh@example.com')
    expect(looksLikeEmail('minh@example.com')).toBe(true)
    expect(looksLikeEmail('minh@example')).toBe(false)
    expect(looksLikeEmail('minh example@x.com')).toBe(false)
    expect(looksLikeEmail('')).toBe(false)
  })
})
