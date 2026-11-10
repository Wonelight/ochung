// Ảnh đại diện tự sinh từ tên, chép thuật toán từ mockup `Avatar tự sinh` (hàm hash và bảng màu P).
const P = [
  ['#3A2A1A', '#E8833A', '#F1E6D2', '#0E0B08'],
  ['#1D2638', '#6FA8DC', '#D9B26F', '#F1E6D2'],
  ['#2B2118', '#D9B26F', '#7A4B2A', '#F1E6D2'],
  ['#3D1F12', '#C8582A', '#F0C987', '#120E0A'],
  ['#162A28', '#7FC7B3', '#E8833A', '#F1E6D2'],
  ['#E9D9B8', '#B5652E', '#2A1E14', '#F7EEDC'],
  ['#2A2238', '#B49CF0', '#E8833A', '#F1E6D2'],
]

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995) >>> 0
  h ^= h >>> 15
  return h >>> 0
}

export function Avatar({ seed, size }: { seed: string; size: number }) {
  const h = hash(seed)
  const p = P[h % P.length]
  const y1 = 58 + ((h >>> 17) % 16)
  const y2 = 50 + ((h >>> 20) % 22)
  const cx = 30 + ((h >>> 23) % 40)
  const dune = `M0 ${y1} Q${cx} ${y2 - 18} 100 ${y2} L100 100 L0 100 Z`
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: p[0],
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 1px rgba(241,230,210,0.10)',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Ảnh đại diện tự sinh của ${seed}`}
        style={{ display: 'block' }}
      >
        <circle cx={26 + ((h >>> 5) % 48)} cy={26 + ((h >>> 9) % 30)} r={16 + ((h >>> 13) % 16)} fill={p[1]} />
        <path d={dune} fill={p[2]} />
        <circle cx={18 + ((h >>> 24) % 64)} cy={14 + ((h >>> 27) % 20)} r={3 + ((h >>> 29) % 5)} fill={p[3]} />
      </svg>
    </div>
  )
}
