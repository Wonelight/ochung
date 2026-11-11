import { describe, expect, it } from 'vitest'
import { readThemeChoice, themeCookie } from './theme'

describe('theme cookie', () => {
  it('đọc light/dark, mọi trường hợp khác là Tự động', () => {
    expect(readThemeChoice('')).toBe('auto')
    expect(readThemeChoice('a=1; theme=light; b=2')).toBe('light')
    expect(readThemeChoice('theme=dark')).toBe('dark')
    expect(readThemeChoice('theme=purple')).toBe('auto')
    expect(readThemeChoice('mytheme=dark')).toBe('auto')
  })

  it('Sáng/Tối ghi cookie 1 năm, Tự động xóa cookie', () => {
    expect(themeCookie('light')).toMatch(/^theme=light; path=\/; max-age=31536000/)
    expect(themeCookie('dark')).toMatch(/^theme=dark; path=\//)
    expect(themeCookie('auto')).toMatch(/^theme=; path=\/; max-age=0/)
  })
})
