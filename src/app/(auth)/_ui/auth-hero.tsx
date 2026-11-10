/** Phần đầu màn Đăng nhập (SVG hố đen + đồi cát + tiêu đề), chép từ mockup `Đăng nhập`. */
export function AuthHero({ subtitle }: { subtitle: string }) {
  return (
    <div className="relative h-[340px] shrink-0">
      <svg
        width="100%"
        height="340"
        viewBox="0 0 390 340"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="absolute left-0 top-0 block"
      >
        <defs>
          <radialGradient id="loginHalo" cx="195" cy="168" r="120" gradientUnits="userSpaceOnUse">
            <stop offset="0.35" stopColor="#E8833A" style={{ stopOpacity: 'var(--c-halo-op)' }} />
            <stop offset="0.6" stopColor="#E8833A" stopOpacity="0.08" />
            <stop offset="1" stopColor="#E8833A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="195" cy="168" r="120" fill="url(#loginHalo)" />
        <circle cx="320" cy="70" r="4" fillOpacity="0.6" style={{ fill: 'var(--c-moon)' }} />
        <circle cx="338" cy="92" r="2" fillOpacity="0.45" style={{ fill: 'var(--c-moon)' }} />
        <ellipse cx="195" cy="168" rx="92" ry="14" fill="none" stroke="#E8833A" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="195" cy="168" r="54" fill="none" stroke="#E8833A" strokeOpacity="0.25" strokeWidth="6" />
        <circle cx="195" cy="168" r="54" fill="none" stroke="#F29A5B" strokeWidth="1.5" />
        <circle cx="195" cy="168" r="48" fill="#000000" />
        <path d="M103 168 A92 14 0 0 0 287 168" fill="none" stroke="#F29A5B" strokeWidth="1.8" />
        <path d="M0 250 Q100 214 200 238 T390 222 V340 H0Z" style={{ fill: 'var(--c-dune1)' }} />
        <path d="M0 286 Q140 252 260 280 T390 270 V340 H0Z" style={{ fill: 'var(--c-dune2)' }} />
        <path d="M0 316 Q120 296 230 312 T390 304 V340 H0Z" style={{ fill: 'var(--c-bg)' }} />
      </svg>
      <div className="absolute inset-x-0 bottom-[18px] flex flex-col items-center gap-1.5">
        <h1 className="m-0 font-numeric text-[22px] font-semibold uppercase tracking-[0.18em]">Chi tiêu nhà</h1>
        <p className="m-0 px-6 text-center text-[14px] text-muted">{subtitle}</p>
      </div>
    </div>
  )
}
