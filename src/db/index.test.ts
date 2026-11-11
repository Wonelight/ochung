import { describe, expect, it, vi } from 'vitest'
import { createNeonPool } from './index'

describe('createNeonPool', () => {
  it('có trình nghe lỗi (lỗi của kết nối rảnh không làm sập tiến trình) và thời gian rảnh ngắn', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pool = createNeonPool('postgres://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require')
    expect(pool.listenerCount('error')).toBeGreaterThan(0)
    expect(pool.options.idleTimeoutMillis).toBe(5_000)
    expect(() => pool.emit('error', new Error('kết nối rảnh bị đóng'))).not.toThrow()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
    await pool.end()
  })
})
