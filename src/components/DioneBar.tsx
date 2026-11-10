import Link from 'next/link'

// Thanh điều hướng Dione — hố đen, chép từ mockup `Thanh điều hướng Dione — hố đen`.
// Màu theo theme lấy từ biến CSS (--c-text = on, --c-faint = off, --c-bar-*), không cần prop theme.
const LED = '#E8833A'
const BAR_PATH = 'M46 20 H160 Q171.7 20 165.5 26 A38 38 0 0 0 165.5 74 Q171.7 80 160 80 H46 A30 30 0 0 1 46 20 Z'

const tabStyle = (active: boolean) =>
  ({
    position: 'absolute',
    top: 22,
    width: 72,
    height: 56,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    color: active ? 'var(--c-text)' : 'var(--c-faint)',
    textDecoration: 'none',
    borderRadius: 28,
  }) as const

const dotStyle = (active: boolean) =>
  ({
    width: 4,
    height: 4,
    borderRadius: 2,
    background: active ? LED : 'transparent',
    boxShadow: `0 0 8px ${active ? LED : 'transparent'}`,
  }) as const

function Shell({ id }: { id: string }) {
  return (
    <>
      <path d={BAR_PATH} style={{ fill: 'var(--c-bar-fill)' }} />
      <path
        d={BAR_PATH}
        fill={`url(#${id})`}
        strokeWidth="1"
        style={{ stroke: 'var(--c-text)', strokeOpacity: 'var(--c-bar-edge-op)' }}
      />
    </>
  )
}

export function DioneBar({ active, showCreate }: { active: 'home' | 'settings'; showCreate: boolean }) {
  return (
    <div style={{ width: 390, height: 96, position: 'relative', color: 'var(--c-text)' }}>
      <svg
        width="390"
        height="96"
        viewBox="0 0 390 96"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          display: 'block',
          overflow: 'visible',
          filter: 'drop-shadow(0 10px 18px var(--c-bar-shadow))',
        }}
      >
        <defs>
          <pattern id="dioneGrille" width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="0.8" fillOpacity="0.1" style={{ fill: 'var(--c-text)' }} />
          </pattern>
        </defs>
        <Shell id="dioneGrille" />
        <g transform="translate(390 0) scale(-1 1)">
          <Shell id="dioneGrille" />
        </g>
        <circle cx="195" cy="50" r="34" fill="none" stroke={LED} strokeOpacity="0.18" strokeWidth="4" />
        <circle cx="195" cy="50" r="34" fill="none" stroke={LED} strokeWidth="1.2" />
      </svg>

      <Link href="/" aria-label="Trang chủ" style={{ ...tabStyle(active === 'home'), left: 54 }}>
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
        <span style={dotStyle(active === 'home')} />
      </Link>

      {showCreate && (
        <Link
          href="/tao"
          aria-label="Tạo mới"
          style={{
            position: 'absolute',
            left: 165,
            top: 20,
            width: 60,
            height: 60,
            borderRadius: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            color: '#F1E6D2',
            background: 'radial-gradient(circle at 50% 50%, #000000 0%, #000000 60%, #140C06 86%, #2E190B 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(232,131,58,0.55), inset 0 0 12px rgba(232,131,58,0.22)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      )}

      <Link href="/cai-dat" aria-label="Cài đặt" style={{ ...tabStyle(active === 'settings'), right: 54 }}>
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span style={dotStyle(active === 'settings')} />
      </Link>
    </div>
  )
}
