import { describe, expect, it } from 'vitest'
import { avatarSeed } from './avatar-seed'

describe('avatarSeed', () => {
  it('biến thể 0 dùng nguyên tên, từ 1 trở lên thêm #<số>', () => {
    expect(avatarSeed('Minh', 0)).toBe('Minh')
    expect(avatarSeed('Minh', 1)).toBe('Minh#1')
    expect(avatarSeed('Minh', 12)).toBe('Minh#12')
  })
})
