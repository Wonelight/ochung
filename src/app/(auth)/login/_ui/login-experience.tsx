'use client'

import { useCallback, useEffect, useRef, useState, type AnimationEvent, type MouseEvent, type RefObject } from 'react'
import { LoginForm } from '../login-form'
import { LandingDunes, LandingPlanet, LandingStars } from './landing-scene'
import { LandingTour } from './landing-tour'
import { LoginHero } from './login-hero'

type View = 'landing' | 'login'

/** Ba câu ngắn, chung chung, đổi lần lượt dưới tên app. */
const LINES = ['Chia tiền nhà mỗi tháng', 'Rõ từng đồng, từng người', 'Cả nhà cùng thấy']

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Câu giới thiệu đổi dần mỗi vài giây. Trình đọc màn hình nghe cả ba câu một lần (bản sr-only), không bị đọc lặp. */
function RotatingLine() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const t = window.setInterval(() => setI((v) => (v + 1) % LINES.length), 3200)
    return () => window.clearInterval(t)
  }, [])
  return (
    <p className="relative m-0 h-6 w-full text-center text-[16px] leading-6 text-muted md:h-7 md:text-[18px] md:leading-7">
      <span className="sr-only">{LINES.join('. ')}.</span>
      {LINES.map((line, k) => (
        <span
          key={line}
          aria-hidden="true"
          // câu cũ mờ đi trước (400ms), câu mới hiện sau đó: hai câu không bao giờ chồng lên nhau
          className={`absolute inset-x-0 transition-[opacity,translate] duration-[400ms] ease-out ${k === i ? 'translate-y-0 opacity-100 delay-[400ms]' : '-translate-y-1.5 opacity-0 delay-0'}`}
        >
          {line}
        </span>
      ))}
    </p>
  )
}

/** Hành tinh thu nhỏ trong island. */
function IslandGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <ellipse cx="13" cy="13" rx="12" ry="2.6" fill="none" stroke="#E8833A" strokeOpacity="0.7" strokeWidth="1.2" />
      <circle cx="13" cy="13" r="7" fill="#000000" stroke="#F29A5B" strokeWidth="1.2" />
      <path d="M1 13 A12 2.6 0 0 0 25 13" fill="none" stroke="#F29A5B" strokeWidth="1.3" />
    </svg>
  )
}

/**
 * Island "Đăng nhập": viên thuốc nổi ở đáy màn, lõi đen ngả nâu như thanh Dione, viền cam trong và quầng cam thở chậm
 * (vị trí đứng yên; nhịp thở do `.landing-island` trong globals.css, khi giảm chuyển động thì giữ bóng tĩnh trong `style`).
 * Là link tới `/login?form`: chạm trước khi trang kịp chạy JavaScript vẫn mở thẳng form; có JavaScript thì chuyển cảnh mờ dần.
 */
function Island({ onOpen }: { onOpen: () => void }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    onOpen()
  }
  return (
    <a
      href="/login?form"
      onClick={onClick}
      className="landing-island group flex h-16 items-center gap-3 rounded-full pl-2.5 pr-6 text-[17px] font-bold text-[#F1E6D2] no-underline transition-transform duration-150 active:scale-[.97] [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      style={{
        background: 'radial-gradient(circle at 50% 50%, #000000 0%, #000000 55%, #140C06 82%, #2E190B 100%)',
        boxShadow: 'inset 0 0 0 1.5px rgba(232,131,58,0.75), 0 8px 24px rgba(232,131,58,0.28)', // khi giảm chuyển động
        filter: 'drop-shadow(0 10px 18px var(--c-bar-shadow))',
      }}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-[#140C06] shadow-[inset_0_0_0_1px_rgba(232,131,58,0.35)]">
        <IslandGlyph />
      </span>
      Đăng nhập
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F29A5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    </a>
  )
}

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="landing-cue-bob">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

const TOUR_ID = 'gioi-thieu'

/**
 * Màn chào phủ toàn màn (cả máy tính). Khung đầu là cảnh: tên app, một câu đổi dần, lối cuộn xuống. Cuộn xuống là phần
 * giới thiệu (landing-tour.tsx). Island nằm ngoài vùng cuộn nên luôn nổi ở đáy, cuộn tới đâu cũng chạm được.
 * Cảnh ra khỏi màn thì đồi cát và sao dừng trôi (`data-still`), đỡ tốn pin khi đang đọc phần dưới.
 */
function Landing({ phase, onOpen, onAnimationEnd }: { phase: 'idle' | 'in' | 'out'; onOpen: () => void; onAnimationEnd: (e: AnimationEvent<HTMLDivElement>) => void }) {
  const leaving = phase === 'out'
  const scrollerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [still, setStill] = useState(false)

  useEffect(() => {
    const root = scrollerRef.current
    const scene = sceneRef.current
    if (!root || !scene) return
    const io = new IntersectionObserver(([e]) => setStill(!e.isIntersecting), { root, threshold: 0 })
    io.observe(scene)
    return () => io.disconnect()
  }, [])

  function toTour() {
    document.getElementById(TOUR_ID)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div
      className={`fixed inset-0 z-20 overflow-hidden bg-bg text-text [--planet:clamp(280px,92vmin,560px)] selection:bg-accent-soft selection:text-text ${phase === 'in' ? 'landing-enter' : ''} ${leaving ? 'landing-leave' : ''}`}
      onAnimationEnd={onAnimationEnd}
      inert={leaving}
      aria-hidden={leaving || undefined}
      data-still={still || undefined}
    >
      <div
        ref={scrollerRef}
        tabIndex={0}
        aria-label="Giới thiệu Chi tiêu nhà"
        role="region"
        className="landing-scroller absolute inset-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Scene sceneRef={sceneRef} onCue={toTour} />
        <LandingTour rootRef={scrollerRef} id={TOUR_ID} />
      </div>
      {/* dải nền mờ dưới island: chữ phần giới thiệu chìm dần trước khi chạm island */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-bg via-bg/85 to-transparent" />
      <div className="landing-island-rise absolute inset-x-0 bottom-0 flex justify-center pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))]">
        <Island onOpen={onOpen} />
      </div>
    </div>
  )
}

/** Khung đầu của màn chào: sao, hành tinh mọc sau đồi cát, tên app và câu đổi dần, lối cuộn xuống phần giới thiệu. */
function Scene({ sceneRef, onCue }: { sceneRef: RefObject<HTMLDivElement | null>; onCue: () => void }) {
  return (
    <div ref={sceneRef} className="relative h-dvh min-h-[520px] overflow-hidden">
      <LandingStars />
      {/*
        Hành tinh mọc lên từ sau dải đồi đầu tiên: tâm ở 60% chiều cao, nửa dưới khuất sau đồi (đồi vẽ sau, nằm trên).
        Tên app và câu giới thiệu neo vào hành tinh (đáy khối chữ cách tâm hành tinh 0.27 × cỡ hành tinh + 12px, tức ngay trên
        vành sáng), nên ở mọi chiều cao màn chữ luôn đứng sát hành tinh, không bỏ lại một khoảng trời trống.
      */}
      <div className="absolute left-1/2 top-[60dvh] aspect-square w-(--planet) -translate-x-1/2 -translate-y-1/2">
        <div className="landing-planet size-full">
          <LandingPlanet />
        </div>
      </div>
      <LandingDunes className="absolute inset-x-0 bottom-0 h-[46dvh] w-full" />
      <div className="landing-copy absolute inset-x-0 bottom-[calc(40dvh+var(--planet)*0.27+12px)] flex flex-col items-center gap-3 px-6">
        <h1 className="m-0 text-balance text-center font-numeric text-[28px] font-semibold uppercase leading-[1.15] tracking-[0.18em] max-[359px]:tracking-[0.12em] md:text-[44px]">
          Chi tiêu nhà
        </h1>
        <RotatingLine />
      </div>
      {/* lối xuống phần giới thiệu, ngay trên island */}
      <button
        type="button"
        onClick={onCue}
        className="landing-copy absolute bottom-[calc(max(32px,env(safe-area-inset-bottom)+16px)+64px+14px)] left-1/2 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-4 text-[13px] font-semibold text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [-webkit-tap-highlight-color:transparent]"
      >
        Xem app làm được gì
        <ChevronDown />
      </button>
    </div>
  )
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

/** Màn đăng nhập đầy đủ: hình hố đen thu gọn, form, lời dặn tài khoản; nút quay lại màn chào ở góc trên. */
function LoginScreen({
  next,
  googleEnabled,
  oauthError,
  entering,
  focusOnMount,
  leaving,
  onBack,
}: {
  next: string
  googleEnabled: boolean
  oauthError: string | null
  entering: boolean
  focusOnMount: boolean
  leaving: boolean
  onBack: () => void
}) {
  useEffect(() => {
    // Vừa chạm island (có hay không có hiệu ứng): đặt sẵn con trỏ vào ô tên đăng nhập (gợi ý passkey hiện ngay trên bàn phím).
    if (focusOnMount) document.getElementById('login-user')?.focus({ preventScroll: true })
  }, [focusOnMount])
  return (
    <div
      className={`relative flex min-h-dvh flex-col selection:bg-accent-soft selection:text-text md:border-x md:border-line ${entering ? 'login-enter' : ''}`}
      inert={leaving}
      aria-hidden={leaving || undefined}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Quay lại"
        className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-10 flex size-11 cursor-pointer items-center justify-center rounded-full border border-line2 bg-bg/60 p-0 text-text transition-transform active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [-webkit-tap-highlight-color:transparent]"
      >
        <BackIcon />
      </button>
      <LoginHero />
      <LoginForm next={next} googleEnabled={googleEnabled} oauthError={oauthError} />
    </div>
  )
}

/**
 * Trang /login: màn chào (cảnh + island) rồi mờ dần sang màn đăng nhập đầy đủ khi chạm island.
 * `startOpen`: vào thẳng màn đăng nhập (có `?next=` từ link mời hay đăng nhập lại, hoặc `?form`).
 * Khi chuyển, màn cũ vẫn ở lại tới hết hiệu ứng rồi mới gỡ (trong lúc đó bị `inert`, không bấm hay đọc được).
 */
export function LoginExperience({
  next,
  startOpen,
  googleEnabled,
  oauthError,
}: {
  next: string
  startOpen: boolean
  googleEnabled: boolean
  oauthError: string | null
}) {
  const [view, setView] = useState<View>(startOpen ? 'login' : 'landing')
  const [leaving, setLeaving] = useState<View | null>(null)
  /** Lần chuyển màn gần nhất có hiệu ứng không (tắt khi người dùng chọn giảm chuyển động). */
  const [animated, setAnimated] = useState(false)
  /** Người dùng đã tự chuyển màn ít nhất một lần: khi đó mới dời tiêu điểm, có hiệu ứng hay không cũng vậy. */
  const [navigated, setNavigated] = useState(false)
  const viewRef = useRef(view)
  /** Lần mở form này có tự thêm một mục vào lịch sử không (để "Quay lại" biết dùng history.back hay không). */
  const pushedRef = useRef(false)

  const go = useCallback((to: View) => {
    const from = viewRef.current
    if (to === from) return
    viewRef.current = to
    const animate = !prefersReducedMotion()
    setAnimated(animate)
    setLeaving(animate ? from : null)
    setNavigated(true)
    setView(to)
  }, [])

  // Mở form thì thêm `form` vào URL như một mục lịch sử mới: nút/cử chỉ back của hệ thống (Android, Zalo, PWA) quay về
  // màn chào thay vì rời trang, và URL khớp với href của island. Giữ nguyên `next` nếu có.
  function open() {
    const url = new URL(window.location.href)
    url.searchParams.set('form', '')
    window.history.pushState(null, '', url)
    pushedRef.current = true
    go('login')
  }

  function back() {
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back() // popstate bên dưới đưa về màn chào
      return
    }
    // vào thẳng form từ link (?form, ?next): không có mục lịch sử nào của mình để lùi, chỉ bỏ `form` khỏi URL
    const url = new URL(window.location.href)
    url.searchParams.delete('form')
    window.history.replaceState(null, '', url)
    go('landing')
  }

  useEffect(() => {
    function onPopState() {
      const wantsForm = new URL(window.location.href).searchParams.has('form')
      if (!wantsForm) pushedRef.current = false
      go(wantsForm ? 'login' : 'landing')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [go])

  // Quay lại màn chào (bằng nút hay bằng back của hệ thống) thì trả tiêu điểm về island.
  useEffect(() => {
    if (navigated && view === 'landing') document.querySelector<HTMLAnchorElement>('.landing-island')?.focus({ preventScroll: true })
  }, [view, navigated])

  function onLandingAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return // bỏ qua hiệu ứng của các phần tử con
    if (e.animationName === 'landing-leave' || e.animationName === 'landing-enter') setLeaving(null)
  }

  const showLanding = view === 'landing' || leaving === 'landing'
  const showLogin = view === 'login' || leaving === 'login'
  const landingPhase = leaving === 'landing' ? 'out' : animated && view === 'landing' && leaving === 'login' ? 'in' : 'idle'

  return (
    <>
      {showLogin && (
        <LoginScreen
          next={next}
          googleEnabled={googleEnabled}
          oauthError={oauthError}
          entering={animated && view === 'login'}
          focusOnMount={navigated && view === 'login'}
          leaving={leaving === 'login'}
          onBack={back}
        />
      )}
      {showLanding && <Landing phase={landingPhase} onOpen={open} onAnimationEnd={onLandingAnimationEnd} />}
    </>
  )
}
