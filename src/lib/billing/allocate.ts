/**
 * Chia `total` đồng theo `weights`, chính xác đến từng đồng (phương pháp dư lớn nhất).
 * Kết quả cùng thứ tự với `weights`, tổng đúng bằng `total`.
 * Phần dư bằng nhau thì người đứng trước trong `weights` được +1 đồng trước.
 *
 * Tính bằng BigInt để `total * w` không bao giờ vượt 2^53 làm mất chính xác.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`total phải là số nguyên không âm: ${total}`)
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new RangeError(`trọng số phải là số nguyên không âm: ${w}`)
    }
  }

  const T = BigInt(total)
  const W = weights.reduce((acc, w) => acc + BigInt(w), BigInt(0))
  if (W === BigInt(0)) throw new RangeError('tổng trọng số phải lớn hơn 0')

  const shares = weights.map((w, index) => {
    const product = T * BigInt(w)
    return { index, floor: product / W, remainder: product % W }
  })

  const distributed = shares.reduce((acc, s) => acc + s.floor, BigInt(0))
  const extra = Number(T - distributed) // < số phần tử, luôn nhỏ

  const winners = [...shares]
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    )
    .slice(0, extra)
    .map((s) => s.index)
  const bonus = new Set(winners)

  return shares.map((s) => Number(s.floor) + (bonus.has(s.index) ? 1 : 0))
}
