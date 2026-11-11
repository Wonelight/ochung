import { describe, expect, it } from 'vitest'
import { dismissPasskeyPrompt, passkeyDeviceName, passkeyPromptDismissed } from './passkey-client'

describe('passkeyDeviceName', () => {
  it('nhận ra iPhone, iPad, Android, Mac, Windows; còn lại là "Thiết bị này"', () => {
    expect(passkeyDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('iPhone')
    expect(passkeyDeviceName('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('iPad')
    expect(passkeyDeviceName('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('Android')
    expect(passkeyDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac')
    expect(passkeyDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows')
    expect(passkeyDeviceName('curl/8')).toBe('Thiết bị này')
  })
})

describe('lời mời Face ID đã bị từ chối', () => {
  function memoryStorage() {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  }

  it('nhớ riêng từng người dùng', () => {
    const s = memoryStorage()
    expect(passkeyPromptDismissed('u1', s)).toBe(false)
    dismissPasskeyPrompt('u1', s)
    expect(passkeyPromptDismissed('u1', s)).toBe(true)
    expect(passkeyPromptDismissed('u2', s)).toBe(false)
  })

  it('localStorage ném lỗi hoặc không có thì không làm app hỏng', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(passkeyPromptDismissed('u1', broken)).toBe(false)
    expect(() => dismissPasskeyPrompt('u1', broken)).not.toThrow()
    expect(passkeyPromptDismissed('u1', null)).toBe(false)
    expect(() => dismissPasskeyPrompt('u1', null)).not.toThrow()
  })
})
