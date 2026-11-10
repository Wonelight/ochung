import { describe, expect, it } from 'vitest'
import { allocate } from '@/lib/billing/allocate'

describe('allocate', () => {
  it('chia đều, đồng dư vào người đứng trước', () => {
    expect(allocate(1_000_000, [1, 1, 1])).toEqual([333_334, 333_333, 333_333])
  })

  it('chia theo trọng số không dư', () => {
    expect(allocate(1_260_000, [30, 30, 30, 15])).toEqual([360_000, 360_000, 360_000, 180_000])
  })

  it('nhiều đồng dư, hòa thì theo thứ tự', () => {
    expect(allocate(100, [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14])
  })

  it('phần lẻ lớn hơn được +1 trước', () => {
    expect(allocate(10, [1, 2])).toEqual([3, 7])
  })

  it('tổng bằng 0', () => {
    expect(allocate(0, [1, 1])).toEqual([0, 0])
  })

  it('trọng số 0 không nhận tiền', () => {
    expect(allocate(10, [0, 1, 0, 1])).toEqual([0, 5, 0, 5])
    expect(allocate(1, [0, 1, 1])).toEqual([0, 1, 0])
  })

  it('một người nhận toàn bộ', () => {
    expect(allocate(123_457, [7])).toEqual([123_457])
  })

  it('không mất độ chính xác với số lớn', () => {
    const total = Number.MAX_SAFE_INTEGER
    const result = allocate(total, [1, 1, 1])
    expect(result.reduce((a, b) => a + b, 0)).toBe(total)
    expect(result).toEqual([3002399751580331, 3002399751580330, 3002399751580330])
  })

  it('ném lỗi khi tổng trọng số bằng 0 hoặc không có trọng số', () => {
    expect(() => allocate(100, [0, 0])).toThrow()
    expect(() => allocate(100, [])).toThrow()
  })

  it('ném lỗi khi total không phải số nguyên không âm an toàn', () => {
    expect(() => allocate(100.5, [1])).toThrow()
    expect(() => allocate(-1, [1])).toThrow()
    expect(() => allocate(Number.NaN, [1])).toThrow()
    expect(() => allocate(Number.POSITIVE_INFINITY, [1])).toThrow()
    expect(() => allocate(2 ** 53, [1])).toThrow()
  })

  it('ném lỗi khi trọng số không phải số nguyên không âm', () => {
    expect(() => allocate(100, [1, -1])).toThrow()
    expect(() => allocate(100, [1, 0.5])).toThrow()
    expect(() => allocate(100, [1, Number.NaN])).toThrow()
  })

  it('thuộc tính: 200 bộ ngẫu nhiên giữ tổng và lệch < 1 đồng so với tỉ lệ', () => {
    // PRNG xác định (mulberry32) để test lặp lại được
    let seed = 20261110
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

    for (let i = 0; i < 200; i++) {
      const total = int(0, 1_000_000_000)
      const n = int(1, 8)
      let weights = Array.from({ length: n }, () => int(0, 31))
      if (weights.every((w) => w === 0)) weights = weights.map(() => 1)
      const sumW = weights.reduce((a, b) => a + b, 0)

      const result = allocate(total, weights)

      expect(result).toHaveLength(n)
      expect(result.reduce((a, b) => a + b, 0)).toBe(total)
      result.forEach((r, idx) => {
        expect(Number.isInteger(r)).toBe(true)
        expect(Math.abs(r - (total * weights[idx]) / sumW)).toBeLessThan(1)
      })
    }
  })
})
