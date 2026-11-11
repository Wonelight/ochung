'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Avatar } from '@/components/Avatar'
import { avatarSeed } from '@/lib/avatar-seed'
import { CopyCodeButton } from '../../nha/_ui/copy-code-button'
import { saveProfileAction, shuffleAvatarAction } from '../actions'

const fieldClass =
  'box-border h-[50px] rounded-[14px] border border-line2 bg-input px-3.5 font-[inherit] text-[16px] text-text outline-none focus:border-accent'
const labelClass = 'text-[13px] font-semibold text-muted'

/**
 * Đầu trang Cài đặt: ảnh đại diện + "Tạo hình mới", thẻ Hồ sơ (tên hiển thị, ngày sinh, mã tài khoản, Lưu thay đổi).
 * Bố cục chép từ mockup `Cài đặt`; tên và hình đổi ngay trên màn như mockup, "Lưu thay đổi" ghi tên + ngày sinh,
 * còn "Tạo hình mới" ghi ngay `avatarVariant + 1` (tăng ở máy chủ nên hai lần bấm liền không đè nhau).
 */
export function ProfileEditor({
  initialName,
  initialDob,
  initialVariant,
  accountCode,
  subtitle,
  today,
}: {
  initialName: string
  initialDob: string
  initialVariant: number
  accountCode: string
  subtitle: string
  /** YYYY-MM-DD hôm nay theo giờ Việt Nam: chặn chọn ngày sinh ở tương lai. */
  today: string
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [dob, setDob] = useState(initialDob)
  const [variant, setVariant] = useState(initialVariant)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const [shuffling, setShuffling] = useState(false)
  const [error, setError] = useState('')

  async function onShuffle() {
    if (shuffling) return
    setShuffling(true)
    setError('')
    try {
      const res = await shuffleAvatarAction()
      if (!res.ok) return setError(res.message)
      setVariant(res.data.avatarVariant)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setShuffling(false)
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      const res = await saveProfileAction({ name, dob })
      if (!res.ok) {
        setSaved(false)
        return setError(res.message)
      }
      setName(name.trim())
      setSaved(true)
      router.refresh()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setPending(false)
    }
  }

  const shownName = name.trim() || initialName

  return (
    <>
      <section className="flex items-center gap-4">
        <div className="flex rounded-full shadow-[0_0_0_2px_var(--c-bg),0_0_0_3px_#E8833A,0_0_22px_rgba(232,131,58,0.30)]">
          <Avatar seed={avatarSeed(shownName, variant)} size={84} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="max-w-full break-words text-[20px] font-bold">{shownName}</span>
          <span className="text-[13px] text-muted">{subtitle}</span>
          <button
            type="button"
            onClick={onShuffle}
            disabled={shuffling}
            className="flex h-11 cursor-pointer items-center gap-1.5 rounded-[22px] border border-line2 bg-surface px-3 font-[inherit] text-[13px] font-semibold text-text disabled:cursor-default disabled:opacity-60"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Tạo hình mới
          </button>
        </div>
      </section>

      <form onSubmit={onSave} className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-4">
        <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Hồ sơ</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-name" className={labelClass}>
            Tên hiển thị
          </label>
          <input
            id="set-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={50}
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-dob" className={labelClass}>
            Ngày sinh
          </label>
          <input
            id="set-dob"
            name="dob"
            type="date"
            min="1900-01-01"
            max={today}
            value={dob}
            onChange={(e) => {
              setDob(e.target.value)
              setSaved(false)
            }}
            className={`${fieldClass} w-full min-w-0`}
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-line pt-1.5">
          <span className="text-[14px] text-muted">Mã tài khoản</span>
          <div className="flex items-center gap-2">
            <span className="font-numeric text-[14px] font-semibold tracking-[0.06em]">{accountCode}</span>
            <CopyCodeButton code={accountCode} label="mã tài khoản" radius={12} />
          </div>
        </div>
        {error && (
          <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-[50px] cursor-pointer rounded-[25px] border-0 bg-accent font-[inherit] text-[15px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
        >
          {pending ? 'Đang lưu…' : saved ? 'Đã lưu' : 'Lưu thay đổi'}
        </button>
      </form>
    </>
  )
}
