import { describe, expect, it } from 'vitest'
import { AppError } from './errors'

describe('AppError', () => {
  it('là Error và giữ code/reason/message', () => {
    const e = new AppError('INVALID', 'READING_DECREASED', 'Chỉ số mới phải ≥ chỉ số cũ')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(AppError)
    expect(e.name).toBe('AppError')
    expect(e.code).toBe('INVALID')
    expect(e.reason).toBe('READING_DECREASED')
    expect(e.message).toBe('Chỉ số mới phải ≥ chỉ số cũ')
  })
})
