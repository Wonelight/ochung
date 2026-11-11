'use client'

import { useSyncExternalStore } from 'react'
import { Segmented } from '../../nha/_ui/settings-parts'
import { THEME_OPTIONS, readThemeChoice, themeCookie, type ThemeChoice } from '@/lib/theme'

const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
const read = () => readThemeChoice(document.cookie)

/** Chọn giao diện Tự động / Sáng / Tối. Áp ngay (data-theme trên <html>) và nhớ bằng cookie `theme`. */
export function ThemePicker() {
  const choice = useSyncExternalStore(subscribe, read, () => 'auto' as ThemeChoice)

  function onChange(next: ThemeChoice) {
    document.cookie = themeCookie(next)
    if (next === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    listeners.forEach((cb) => cb())
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5">
      <h2 className="m-0 text-[17px] font-semibold">Giao diện</h2>
      <Segmented value={choice} options={THEME_OPTIONS} onChange={onChange} label="Giao diện" />
    </section>
  )
}
