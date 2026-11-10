import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { actorFromUser } from './actor'

function reasonOf(fn: () => unknown) {
  try {
    fn()
  } catch (e) {
    if (e instanceof AppError) return `${e.code}:${e.reason}`
    throw e
  }
  return null
}

describe('actorFromUser', () => {
  it('trả userId và role', () => {
    expect(actorFromUser({ id: 'u1', role: 'admin' })).toEqual({ userId: 'u1', role: 'admin' })
    expect(actorFromUser({ id: 'u2', role: 'user' })).toEqual({ userId: 'u2', role: 'user' })
  })

  it('role null hoặc lạ được coi là user thường', () => {
    expect(actorFromUser({ id: 'u1', role: null }).role).toBe('user')
    expect(actorFromUser({ id: 'u1', role: 'superuser' }).role).toBe('user')
  })

  it('tài khoản bị khóa: FORBIDDEN/BANNED', () => {
    expect(reasonOf(() => actorFromUser({ id: 'u1', role: 'user', banned: true }))).toBe('FORBIDDEN:BANNED')
  })

  it('khóa có thời hạn: còn hạn thì chặn, hết hạn thì cho qua', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    const later = new Date('2026-11-11T00:00:00Z')
    const earlier = new Date('2026-11-09T00:00:00Z')
    expect(reasonOf(() => actorFromUser({ id: 'u', banned: true, banExpires: later }, now))).toBe('FORBIDDEN:BANNED')
    expect(reasonOf(() => actorFromUser({ id: 'u', banned: true, banExpires: earlier }, now))).toBeNull()
  })
})
