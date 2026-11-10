'use client'

import { useState } from 'react'

const inputClass =
  'h-[52px] w-full rounded-[14px] border border-line2 bg-(--c-login-input) px-4 font-[inherit] text-[17px] text-text outline-none focus:border-accent'
const labelClass = 'text-[13px] font-semibold text-muted'

export function TextField({
  id,
  label,
  autoComplete,
  placeholder,
}: {
  id: string
  label: string
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        required
        className={inputClass}
      />
    </div>
  )
}

/** Ô mật khẩu có nút mắt hiện/ẩn (icon và kích thước 44px theo mockup). */
export function PasswordField({ id, label, autoComplete }: { id: string; label: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative flex">
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          className={`${inputClass} flex-1 pr-14`}
        />
        <button
          type="button"
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          onClick={() => setShow((v) => !v)}
          className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-[12px] border-0 bg-transparent p-0 text-muted"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="m-0 text-[14px] font-medium text-unpaid-fg">
      {message}
    </p>
  )
}

export function PrimaryButton({ pending, children, pendingLabel }: { pending: boolean; children: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 h-[54px] cursor-pointer rounded-[27px] border-0 bg-accent font-[inherit] text-[17px] font-bold text-[#1A0F06] shadow-[0_8px_24px_rgba(232,131,58,0.28)] disabled:cursor-default disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
