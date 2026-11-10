import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPushSender, getPushSender, getVapidPublicKey } from './push'

const sub = { endpoint: 'https://web.push.apple.com/x', p256dh: 'p', auth: 'a' }
const payload = { title: 'T', body: 'B', url: '/phieu/1' }
const vapid = { subject: 'mailto:a@b.c', publicKey: 'pub', privateKey: 'priv' }
const isGone = (e: unknown) => (e as { statusCode?: number }).statusCode === 410

describe('PushSender', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('gửi JSON {title, body, url} kèm VAPID; thành công → ok', async () => {
    const raw = vi.fn().mockResolvedValue({ statusCode: 201 })
    expect(await createPushSender(raw, vapid, isGone)(sub, payload)).toBe('ok')
    const [s, body, options] = raw.mock.calls[0]
    expect(s).toEqual({ endpoint: sub.endpoint, keys: { p256dh: 'p', auth: 'a' } })
    expect(JSON.parse(body)).toEqual(payload)
    expect(options.vapidDetails).toEqual(vapid)
  })

  it('404/410 → gone; lỗi khác chỉ ghi log và không ném', async () => {
    const gone = createPushSender(vi.fn().mockRejectedValue({ statusCode: 410 }), vapid, isGone)
    expect(await gone(sub, payload)).toBe('gone')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const other = createPushSender(vi.fn().mockRejectedValue(new Error('mạng')), vapid, isGone)
    expect(await other(sub, payload)).toBe('ok')
    expect(err).toHaveBeenCalled()
  })

  it('thiếu biến VAPID → bộ gửi no-op trả ok, không gọi mạng', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('VAPID_SUBJECT', '')
    expect(await getPushSender()(sub, payload)).toBe('ok')
    expect(getVapidPublicKey()).toBeNull()
  })
})
