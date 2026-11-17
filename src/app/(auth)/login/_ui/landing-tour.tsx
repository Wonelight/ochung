'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Avatar } from '@/components/Avatar'
import { CategoryIcon, type CategoryKind } from '@/components/CategoryIcon'
import { Money } from '@/components/Money'
import { StatusPill } from '@/components/StatusPill'

/**
 * Phần giới thiệu dưới màn chào: một phiếu thanh toán mẫu được ghim lại, đổi trạng thái theo từng bước khi cuộn qua
 * (nhập số công tơ → vắng vài ngày thì tiền giảm → quét mã → cả nhà thấy ai đã đóng). Không phải lưới thẻ tính năng:
 * cả đoạn là một tháng của một người, từ lúc có hóa đơn tới lúc đóng xong.
 *
 * Số liệu minh họa, tự khớp với nhau: nhà 3 người, tiền nhà 4.500.000, điện 1.087.800, nước 176.400. Minh ở 24/30 ngày
 * nên phần điện nước theo tỉ lệ 24/(24+30+30) = 2/7: 310.800 và 50.400 (chia đều thì là 362.600 và 58.800).
 * Chữ của từng bước nằm trong danh sách bên cạnh, phiếu chỉ để nhìn (aria-hidden), nên trình đọc màn hình đọc đủ nội dung.
 */

const STEPS = [
  {
    title: 'Chủ nhà chỉ cần nhập số công tơ',
    body: 'Điện nước tính theo bậc, có cả VAT. Gõ tới đâu, tiền hiện ra tới đó.',
  },
  {
    title: 'Vắng nhà thì trả ít hơn',
    body: 'Ai về quê mấy hôm thì phần điện nước của người đó tự giảm theo số ngày ở.',
  },
  {
    title: 'Quét mã là chuyển',
    body: 'Mã VietQR có sẵn số tiền và nội dung, khỏi gõ lại. Chuyển xong thì bấm “Tôi đã chuyển”.',
  },
  {
    title: 'Ai đóng rồi, cả nhà đều thấy',
    body: 'Không phải nhắn hỏi từng người. Chủ nhà xác nhận xong, phiếu chuyển sang Đã trả.',
  },
] as const

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]'

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Mã QR minh họa 25×25 (ba ô định vị ở góc, phần còn lại sinh giả ngẫu nhiên cố định), đen trên trắng như mã thật của app.
 * Không mã hóa gì, chỉ để nhìn.
 */
const QR_PATH = (() => {
  const n = 25
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const dx = x - fx
      const dy = y - fy
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return 0 // khoảng trắng quanh ô định vị
        const ring = Math.min(dx, dy, 6 - dx, 6 - dy)
        return ring === 1 ? 0 : 1
      }
    }
    return -1
  }
  let seed = 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  let d = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const f = finder(x, y)
      const on = f === -1 ? rand() < 0.48 : f === 1
      if (on) d += `M${x} ${y}h1v1h-1z`
    }
  }
  return d
})()

function QrMark() {
  return (
    <span className="flex size-[88px] shrink-0 items-center justify-center rounded-[12px] bg-[#FFFFFF] p-[7px]">
      <svg viewBox="0 0 25 25" width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
        <path d={QR_PATH} fill="#000000" />
      </svg>
    </span>
  )
}

/** Số tiền đổi giá trị: số cũ trượt lên và mờ đi, số mới trồi vào đúng chỗ đó (hai số chung một ô lưới, căn phải). */
function AmountSwap({ from, to, swapped, className }: { from: number; to: number; swapped: boolean; className: string }) {
  const base = `col-start-1 row-start-1 justify-self-end transition-[opacity,translate,filter] duration-500 ${EASE} motion-reduce:translate-y-0 motion-reduce:blur-none motion-reduce:duration-200`
  return (
    <span className="grid">
      <Money amount={from} className={`${base} ${className} ${swapped ? '-translate-y-2 opacity-0 blur-[2px]' : 'translate-y-0 opacity-100'}`} />
      <Money amount={to} className={`${base} ${className} ${swapped ? 'translate-y-0 opacity-100 delay-100' : 'translate-y-2 opacity-0 blur-[2px]'}`} />
    </span>
  )
}

function SlipLine({ kind, name, note, children }: { kind: CategoryKind; name: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <CategoryIcon kind={kind} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] font-semibold leading-[1.3]">{name}</p>
        {note}
      </div>
      {children}
    </div>
  )
}

/** Một ngăn ở đáy phiếu; bốn ngăn chồng lên nhau, ngăn của bước đang xem hiện rõ, các ngăn khác mờ và lùi nhẹ. */
function Tray({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-0 flex items-center gap-3.5 p-3.5 transition-[opacity,translate,filter] duration-500 ${EASE} motion-reduce:translate-y-0 motion-reduce:blur-none motion-reduce:duration-200 ${
        shown ? 'translate-y-0 opacity-100 delay-75' : 'pointer-events-none translate-y-3 opacity-0 blur-[3px]'
      }`}
    >
      {children}
    </div>
  )
}

/** Ô nhập số công tơ: số hiện dần như đang gõ, gõ xong thì tiền điện cả nhà hiện ra. */
function MeterTray({ shown, typing }: { shown: boolean; typing: boolean }) {
  const reading = '4.630'
  // Đếm số ký tự đã gõ chỉ trong lúc đang gõ; ngoài lúc đó (chưa cuộn tới, giảm chuyển động, không có JavaScript) hiện đủ số.
  const [typed, setTyped] = useState(0)
  const animate = typing && !reducedMotion()
  useEffect(() => {
    if (!animate) return
    let k = 0
    const t = window.setInterval(() => {
      k += 1
      setTyped(k)
      if (k >= reading.length) window.clearInterval(t)
    }, 150)
    return () => {
      window.clearInterval(t)
      setTyped(0) // lần sau quay lại bước này thì gõ lại từ đầu
    }
  }, [animate])
  const chars = animate ? typed : reading.length
  const done = chars >= reading.length
  return (
    <Tray shown={shown}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[12px] font-semibold leading-[1.3] text-muted">Số điện cuối tháng</span>
        <span className="flex h-11 items-center rounded-[12px] border border-accent bg-field px-3 font-numeric text-[18px] font-semibold tabular-nums tracking-[-0.03em]">
          {reading.slice(0, chars)}
          <span className={`ml-0.5 h-5 w-[2px] rounded-full bg-accent ${typing ? 'tour-caret' : ''}`} />
        </span>
      </div>
      <div className={`flex flex-col items-end gap-1.5 text-right transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-[12px] font-semibold leading-[1.3] text-muted">Điện cả nhà</span>
        <Money amount={1087800} className="font-numeric text-[16px] font-semibold tabular-nums tracking-[-0.03em]" />
        <span className="text-[11px] leading-[1.3] text-muted">đã gồm VAT</span>
      </div>
    </Tray>
  )
}

function DaysTray({ shown }: { shown: boolean }) {
  return (
    <Tray shown={shown}>
      <div className="flex w-full flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted">Minh ở tháng này</span>
          <span className="font-numeric text-[16px] font-semibold tabular-nums tracking-[-0.03em]">
            24<span className="text-muted">/30 ngày</span>
          </span>
        </div>
        <span className="relative block h-1.5 overflow-hidden rounded-[3px] bg-line2">
          <span
            className={`absolute inset-y-0 left-0 w-full origin-left rounded-[3px] bg-accent shadow-[0_0_10px_var(--c-glow)] transition-transform duration-700 ${EASE} motion-reduce:duration-0 ${shown ? 'scale-x-[0.8]' : 'scale-x-100'}`}
          />
        </span>
        <span className="text-[12px] font-semibold leading-[1.3] text-muted">Về quê 6 ngày, điện nước tính bớt phần đó</span>
      </div>
    </Tray>
  )
}

function QrTray({ shown }: { shown: boolean }) {
  return (
    <Tray shown={shown}>
      <QrMark />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Money amount={1861200} className="font-numeric text-[18px] font-semibold tabular-nums tracking-[-0.03em]" />
        <span className="text-[12px] font-semibold leading-[1.3] text-muted">Nội dung: MINH T11</span>
        <span className="mt-1.5 flex h-8 w-fit items-center rounded-full border border-accent-line px-3 text-[13px] font-semibold text-accent-text">
          Tôi đã chuyển
        </span>
      </div>
    </Tray>
  )
}

const MEMBERS = [
  { name: 'Minh', tone: 'paid', text: 'Đã trả' },
  { name: 'Lan', tone: 'paid', text: 'Đã trả' },
  { name: 'Huy', tone: 'pending', text: 'Chờ xác nhận' },
] as const

function HouseTray({ shown }: { shown: boolean }) {
  return (
    <Tray shown={shown}>
      <ul className="m-0 flex w-full list-none flex-col gap-1 p-0">
        {MEMBERS.map((m, k) => (
          <li
            key={m.name}
            className={`flex items-center gap-2.5 transition-[opacity,translate] duration-500 ${EASE} motion-reduce:translate-x-0 ${shown ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`}
            style={{ transitionDelay: shown ? `${120 + k * 70}ms` : '0ms' }}
          >
            <span className="overflow-hidden rounded-full">
              <Avatar seed={m.name} size={26} />
            </span>
            <span className="flex-1 text-[14px] font-semibold">{m.name}</span>
            <StatusPill tone={m.tone} text={m.text} compact />
          </li>
        ))}
      </ul>
    </Tray>
  )
}

/** Phiếu tháng 11 của Minh, vẽ bằng chính các mảnh giao diện của app (ô icon khoản, nhãn trạng thái, số Lexend Exa). */
function TourSlip({ step, typing }: { step: number; typing: boolean }) {
  const reduced = step >= 1
  const paid = step >= 3
  return (
    <div aria-hidden="true" className="rounded-[28px] border border-line bg-card p-[18px] text-text [@media(max-height:740px)]:p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[12px] font-semibold leading-[1.3] text-muted">Phiếu tháng 11</p>
          <p className="m-0 mt-0.5 text-[20px] font-bold leading-[1.25]">Minh</p>
        </div>
        <span className="grid">
          <span className={`col-start-1 row-start-1 justify-self-end transition-opacity duration-300 ${paid ? 'opacity-0' : 'opacity-100'}`}>
            <StatusPill tone="unpaid" text="Chưa trả" />
          </span>
          <span className={`col-start-1 row-start-1 justify-self-end transition-[opacity,scale] duration-500 ${EASE} motion-reduce:scale-100 ${paid ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
            <StatusPill tone="paid" text="Đã trả" />
          </span>
        </span>
      </div>

      <div className="mt-[18px] flex flex-col gap-3.5 [@media(max-height:740px)]:mt-3 [@media(max-height:740px)]:gap-2">
        <SlipLine kind="rent" name="Tiền nhà">
          <Money amount={1500000} className="font-numeric text-[16px] font-semibold tabular-nums tracking-[-0.03em]" />
        </SlipLine>
        <SlipLine
          kind="elec"
          name="Điện"
          note={
            <span className={`block text-[12px] font-semibold leading-[1.3] text-accent-text transition-opacity duration-300 ${reduced ? 'opacity-100' : 'opacity-0'}`}>
              theo 24/30 ngày ở
            </span>
          }
        >
          <AmountSwap from={362600} to={310800} swapped={reduced} className="font-numeric text-[16px] font-semibold tabular-nums tracking-[-0.03em]" />
        </SlipLine>
        <SlipLine
          kind="water"
          name="Nước"
          note={
            <span className={`block text-[12px] font-semibold leading-[1.3] text-accent-text transition-opacity duration-300 ${reduced ? 'opacity-100' : 'opacity-0'}`}>
              theo 24/30 ngày ở
            </span>
          }
        >
          <AmountSwap from={58800} to={50400} swapped={reduced} className="font-numeric text-[16px] font-semibold tabular-nums tracking-[-0.03em]" />
        </SlipLine>
      </div>

      <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-line pt-3.5 [@media(max-height:740px)]:mt-2.5 [@media(max-height:740px)]:pt-2.5">
        <span className="text-[13px] font-semibold text-muted">Cần chuyển</span>
        <AmountSwap from={1921400} to={1861200} swapped={reduced} className="font-numeric text-[24px] font-semibold tabular-nums tracking-[-0.04em]" />
      </div>

      <div className="relative mt-3.5 h-[116px] overflow-hidden rounded-[18px] bg-inner [@media(max-height:740px)]:mt-2.5">
        <MeterTray shown={step === 0} typing={typing} />
        <DaysTray shown={step === 1} />
        <QrTray shown={step === 2} />
        <HouseTray shown={step === 3} />
      </div>

      <p className="m-0 mt-2.5 text-center text-[11px] [@media(max-height:740px)]:mt-1.5 leading-[1.3] text-muted">Số liệu minh họa</p>
    </div>
  )
}

/**
 * Bước đang xem: bước có chữ cắt qua một dải mỏng ở khoảng 58% chiều cao vùng cuộn (ngay dưới phiếu đang ghim trên điện thoại,
 * giữa màn trên máy tính). Chưa cuộn tới thì giữ bước đầu; không có JavaScript thì phiếu đứng ở bước đầu, chữ vẫn đọc đủ.
 */
function useActiveStep(rootRef: RefObject<HTMLElement | null>, itemRefs: RefObject<(HTMLElement | null)[]>) {
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(false)
  useEffect(() => {
    const root = rootRef.current
    const items = itemRefs.current.filter((el): el is HTMLElement => el !== null)
    if (!root || items.length === 0) return
    // Điện thoại: phiếu ghim chiếm nửa trên, chữ bước mới trồi lên ngay trên island thì bước đó bắt đầu (dải ở 84%), và
    // các bước ngắn (36dvh) nên tới khi bước sau bắt đầu thì chữ bước trước vừa lùi vào sau phiếu. Máy tính: dải giữa màn.
    const wide = window.matchMedia('(min-width: 768px)').matches
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const k = items.indexOf(e.target as HTMLElement)
          if (k >= 0) {
            setStep(k)
            setReached(true)
          }
        }
      },
      { root, rootMargin: wide ? '-50% 0px -49% 0px' : '-84% 0px -15% 0px' },
    )
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [rootRef, itemRefs])
  return { step, reached }
}

/** LED cam của tab đang mở trên thanh Dione, dùng lại làm dấu bước đang xem. */
function StepLed({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-[9px] size-1.5 shrink-0 rounded-full md:mt-[12px] transition-[background-color,box-shadow] duration-300 ${on ? 'bg-accent shadow-[0_0_8px_2px_rgba(232,131,58,0.55)]' : 'bg-line2'}`}
    />
  )
}

export function LandingTour({ rootRef, id }: { rootRef: RefObject<HTMLElement | null>; id: string }) {
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const { step, reached } = useActiveStep(rootRef, itemRefs)

  return (
    <>
      <section id={id} aria-labelledby={`${id}-title`} className="relative mx-auto w-full max-w-[430px] px-5 pt-16 md:grid md:max-w-[960px] md:grid-cols-[minmax(0,1fr)_400px] md:gap-x-16 md:px-8 md:pt-28">
        <h2
          id={`${id}-title`}
          className="m-0 text-balance text-[28px] font-bold leading-[1.2] md:col-span-2 md:max-w-[16ch] md:text-[40px]"
        >
          Cuối tháng, khỏi ngồi bấm máy tính
        </h2>

        {/* Điện thoại: phiếu ghim ở đầu vùng cuộn, chữ các bước trượt qua bên dưới (lớp nền + dải mờ che chữ đang lùi vào sau phiếu). */}
        <div className="sticky top-0 z-10 -mx-5 bg-bg px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-10 after:bg-linear-to-b after:from-bg after:to-transparent after:content-[''] md:order-2 md:mx-0 md:mt-12 md:self-start md:bg-transparent md:px-0 md:pt-0 md:pb-0 md:after:hidden md:top-[max(24px,calc(50dvh-250px))]">
          <TourSlip step={step} typing={reached && step === 0} />
        </div>

        <ol className="m-0 list-none p-0 md:order-1 md:mt-12">
          {STEPS.map((s, k) => (
            <li
              key={s.title}
              ref={(el) => {
                itemRefs.current[k] = el
              }}
              className="flex min-h-[36dvh] pt-6 md:min-h-[64dvh] md:items-center md:pt-0"
            >
              <div className="flex gap-3">
                <StepLed on={step === k} />
                <div className="max-w-[34ch]">
                  <h3 className={`m-0 text-balance text-[20px] font-bold leading-[1.25] transition-colors duration-300 md:text-[24px] ${step === k ? 'text-text' : 'text-muted'}`}>
                    {s.title}
                  </h3>
                  <p className="m-0 mt-2 text-[15px] leading-[1.55] text-muted md:text-[16px]">{s.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${id}-exact`} className="mx-auto w-full max-w-[430px] px-5 pb-[calc(max(32px,env(safe-area-inset-bottom)+16px)+120px)] pt-10 md:max-w-[960px] md:px-8 md:pt-16">
        <div className="border-t border-line pt-10 md:max-w-[560px]">
          <h2 id={`${id}-exact`} className="m-0 text-balance text-[24px] font-bold leading-[1.25] md:text-[32px]">
            Đúng tới từng đồng
          </h2>
          <p className="m-0 mt-3 max-w-[40ch] text-[15px] leading-[1.55] text-muted md:text-[16px]">
            Tiền chia không chẵn vẫn được dồn cho khớp, cộng các phiếu lại đúng bằng hóa đơn. Không ai trả thừa, cũng không ai phải bù.
          </p>
          <p className="m-0 mt-8 text-[13px] leading-normal text-muted">Tự tạo tài khoản ngay ở màn đăng nhập, rồi vào nhà bằng link mời của chủ nhà.</p>
        </div>
      </section>
    </>
  )
}
