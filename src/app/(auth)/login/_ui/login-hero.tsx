/**
 * Đầu màn Đăng nhập: hố đen trên đồi cát (hình của mockup `Đăng nhập`), co theo chiều cao màn hình để form và
 * lối xuống phần giới thiệu luôn nằm trong màn đầu, kể cả trình duyệt nhúng của Zalo/Messenger.
 * Hình neo đáy (xMidYMax slice); vùng nhìn rộng hơn khung 20px mỗi bên và bắt đầu ngay trên quầng của hố đen, nên khi màn thấp
 * hình thu nhỏ cả khối thay vì cắt mất vành hố đen (đến tối thiểu 216px vẫn nguyên); màn cao hơn thì hình phóng lên, cắt bớt hai bên.
 */
export function LoginHero() {
  return (
    <header className="relative h-[clamp(216px,32dvh,300px)] shrink-0 overflow-hidden">
      <svg
        width="100%"
        height="100%"
        viewBox="-20 96 430 244"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        className="absolute inset-0 block"
      >
        <defs>
          <radialGradient id="loginHeroHalo" cx="195" cy="168" r="120" gradientUnits="userSpaceOnUse">
            <stop offset="0.35" stopColor="#E8833A" style={{ stopOpacity: 'var(--c-halo-op)' }} />
            <stop offset="0.6" stopColor="#E8833A" stopOpacity="0.08" />
            <stop offset="1" stopColor="#E8833A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="195" cy="168" r="120" fill="url(#loginHeroHalo)" />
        <circle cx="322" cy="122" r="4" fillOpacity="0.6" style={{ fill: 'var(--c-moon)' }} />
        <circle cx="340" cy="142" r="2" fillOpacity="0.45" style={{ fill: 'var(--c-moon)' }} />
        <ellipse cx="195" cy="168" rx="92" ry="14" fill="none" stroke="#E8833A" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="195" cy="168" r="54" fill="none" stroke="#E8833A" strokeOpacity="0.25" strokeWidth="6" />
        <circle cx="195" cy="168" r="54" fill="none" stroke="#F29A5B" strokeWidth="1.5" />
        <circle cx="195" cy="168" r="48" fill="#000000" />
        <path d="M103 168 A92 14 0 0 0 287 168" fill="none" stroke="#F29A5B" strokeWidth="1.8" />
        <path d="M-20 250 L0 250 Q100 214 200 238 T390 222 L410 222 V340 H-20Z" style={{ fill: 'var(--c-dune1)' }} />
        <path d="M-20 286 L0 286 Q140 252 260 280 T390 270 L410 270 V340 H-20Z" style={{ fill: 'var(--c-dune2)' }} />
        <path d="M-20 316 L0 316 Q120 296 230 312 T390 304 L410 304 V340 H-20Z" style={{ fill: 'var(--c-bg)' }} />
      </svg>
      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1.5 px-6 text-center">
        <h1 className="m-0 font-numeric text-[24px] font-semibold uppercase leading-none tracking-[0.18em]">Chi tiêu nhà</h1>
        <p className="m-0 text-[14px] text-muted">Điện, nước, dịch vụ — chia gọn mỗi tháng</p>
      </div>
    </header>
  )
}
