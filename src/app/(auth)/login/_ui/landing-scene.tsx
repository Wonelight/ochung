// Cảnh của màn chào: bầu trời đêm (giấy kem ở giao diện sáng), vài vì sao, hành tinh lõi đen viền cam, ba lớp đồi cát.
// Chỉ để nhìn (aria-hidden). Chuyển động khai báo trong globals.css (nhóm `landing-*`), tắt hết khi giảm chuyển động.

/**
 * Vì sao: vị trí theo % màn, lấp lánh lệch nhịp nhau. Chỉ đặt ở khoảng trời trên cùng (y ≤ 24%) hoặc sát hai mép
 * (x ≤ 5% hay ≥ 95%), vì khối chữ neo vào hành tinh và trượt lên xuống theo chiều cao màn, có thể nằm trong khoảng 30–48%.
 */
const STARS = [
  { x: '14%', y: '10%', r: 2, d: '0s' },
  { x: '82%', y: '8%', r: 3, d: '-1.2s' },
  { x: '90%', y: '20%', r: 1.5, d: '-2.4s' },
  { x: '38%', y: '22%', r: 1.5, d: '-3.1s' },
  { x: '4%', y: '30%', r: 2, d: '-0.6s' },
  { x: '96%', y: '42%', r: 1.5, d: '-1.8s' },
]

export function LandingStars() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {STARS.map((s) => (
        <span
          key={`${s.x}-${s.y}`}
          className="landing-twinkle absolute rounded-full bg-(--c-moon)"
          style={{ left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, animationDelay: s.d }}
        />
      ))}
    </div>
  )
}

/** Hành tinh: quầng cam, vành nghiêng phía sau, lõi đen, nửa vành phía trước (hình của mockup `Đăng nhập`, vẽ lại cho khung vuông). */
export function LandingPlanet() {
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%" aria-hidden="true" className="block overflow-visible">
      <defs>
        <radialGradient id="landingHalo" cx="150" cy="150" r="150" gradientUnits="userSpaceOnUse">
          <stop offset="0.3" stopColor="#E8833A" style={{ stopOpacity: 'var(--c-halo-op)' }} />
          <stop offset="0.62" stopColor="#E8833A" stopOpacity="0.08" />
          <stop offset="1" stopColor="#E8833A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="150" cy="150" r="150" fill="url(#landingHalo)" />
      <ellipse cx="150" cy="150" rx="122" ry="19" fill="none" stroke="#E8833A" strokeOpacity="0.55" strokeWidth="1.6" />
      <circle cx="150" cy="150" r="70" fill="none" stroke="#E8833A" strokeOpacity="0.25" strokeWidth="7" />
      <circle cx="150" cy="150" r="70" fill="none" stroke="#F29A5B" strokeWidth="1.6" />
      <circle cx="150" cy="150" r="62" fill="#000000" />
      <path d="M28 150 A122 19 0 0 0 272 150" fill="none" stroke="#F29A5B" strokeWidth="2" />
    </svg>
  )
}

/**
 * Ba lớp đồi cát trải hết bề ngang (preserveAspectRatio none), mỗi lớp trôi qua lại thật chậm với nhịp khác nhau.
 * Đường vẽ rộng hơn khung 150 đơn vị mỗi bên để khi trôi không lộ mép.
 * Sống mỗi dải đồi bắt ánh cam của hành tinh (nguồn sáng duy nhất của cảnh): lớp gần hành tinh sáng nhất, xa dần thì mờ.
 * Nhờ vậy đồi cát vẫn đọc được ở giao diện tối, nơi màu các lớp đồi chỉ chênh nhau rất ít.
 */
const RIDGES = [
  { top: 'M-150 120 C100 40 350 60 600 110 S1000 60 1350 90', fill: 'var(--c-dune1)', rim: 0.55, duration: '34s', delay: '0s' },
  { top: 'M-150 215 C150 150 450 170 700 215 S1100 170 1350 200', fill: 'var(--c-dune2)', rim: 0.3, duration: '26s', delay: '-9s' },
  { top: 'M-150 312 C200 270 500 290 760 322 S1150 285 1350 300', fill: 'var(--c-bg)', rim: 0.16, duration: '20s', delay: '-4s' },
]

export function LandingDunes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden="true" className={`block overflow-visible ${className ?? ''}`}>
      {RIDGES.map((r) => (
        <g key={r.top} className="landing-drift" style={{ animationDuration: r.duration, animationDelay: r.delay }}>
          <path d={`${r.top} V400 H-150Z`} style={{ fill: r.fill }} />
          <path d={r.top} fill="none" stroke="#E8833A" strokeOpacity={r.rim} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  )
}
