// Giao diện Tự động / Sáng / Tối. Lựa chọn nằm ở cookie `theme` (= light | dark; không có cookie = Tự động, theo máy);
// script trong <head> của layout gốc đọc cookie này và đặt data-theme trước khi vẽ.

export type ThemeChoice = 'auto' | 'light' | 'dark'

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Tự động' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]

const ONE_YEAR = 60 * 60 * 24 * 365

/** Đọc lựa chọn từ chuỗi `document.cookie`. */
export function readThemeChoice(cookie: string): ThemeChoice {
  const m = cookie.match(/(?:^|; )theme=(light|dark)(?:;|$)/)
  return m ? (m[1] as ThemeChoice) : 'auto'
}

/** Giá trị gán cho `document.cookie`: Tự động xóa cookie (max-age=0). */
export function themeCookie(choice: ThemeChoice): string {
  return choice === 'auto'
    ? 'theme=; path=/; max-age=0; samesite=lax'
    : `theme=${choice}; path=/; max-age=${ONE_YEAR}; samesite=lax`
}
