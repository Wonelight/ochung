import { useState, type ReactNode } from 'react'

// Chỉ dùng bên trong login-form.tsx (đã là client component), nên không cần 'use client' riêng.
// Ô nhập, nút và dòng lỗi riêng của màn Đăng nhập. Màn Đổi mật khẩu và trang link mời vẫn dùng `(auth)/_ui/fields.tsx`.
// Lấy nét: cùng vòng `focus` 2px cách 2px của mọi nút trong app (button-styles.ts). Ô nhập có `outline-none` khi không lấy nét,
// nên phải đặt lại `focus:outline-solid` (Tailwind 4: outline-none đặt kiểu viền là none, outline-2 không tự bật lại). Ô sai: viền đỏ + aria-invalid,
// mô tả lỗi nối bằng aria-describedby để trình đọc màn hình đọc kèm.

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const inputClass =
  'h-[52px] w-full rounded-[14px] border border-line2 bg-(--c-login-input) px-4 font-[inherit] text-[17px] text-text caret-accent ' +
  'placeholder:text-muted outline-none transition-colors focus:border-accent focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-focus ' +
  'aria-[invalid=true]:border-danger-line'

const labelClass = 'text-[13px] font-semibold text-muted'

type FieldA11y = { invalid: boolean; describedBy?: string }

export function LoginTextField({
  id,
  label,
  autoComplete,
  placeholder,
  invalid,
  describedBy,
  autoCapitalize = 'none',
  maxLength,
  type = 'text',
  inputMode,
}: {
  id: string
  label: string
  autoComplete: string
  placeholder?: string
  autoCapitalize?: 'none' | 'words'
  maxLength?: number
  type?: 'text' | 'email'
  inputMode?: 'email' | 'text'
} & FieldA11y) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        maxLength={maxLength}
        placeholder={placeholder}
        required
        aria-invalid={invalid}
        aria-describedby={invalid ? describedBy : undefined}
        className={inputClass}
      />
    </div>
  )
}

/** Ô nhập mã OTP 6 số: bàn phím số, iOS/Android tự gợi ý mã vừa nhận (autocomplete one-time-code), chỉ nhận chữ số. */
export function LoginOtpField({ id, label = 'Mã 6 số', invalid, describedBy }: { id: string; label?: string } & FieldA11y) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        enterKeyHint="go"
        required
        aria-invalid={invalid}
        aria-describedby={invalid ? describedBy : undefined}
        onInput={(e) => {
          e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 6)
        }}
        className={`${inputClass} text-center font-numeric text-[26px] font-semibold tracking-[0.5em] placeholder:tracking-[0.5em]`}
      />
    </div>
  )
}

/** Nút chữ (cao 44px) cho hành động phụ như "Gửi lại mã", "Quay lại". */
export function LoginLinkButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 cursor-pointer border-0 bg-transparent px-2 font-[inherit] text-[14px] font-semibold text-accent-text disabled:cursor-default disabled:text-muted ${focusRing}`}
    >
      {children}
    </button>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  )
}

/** Ô mật khẩu có nút mắt hiện/ẩn (44px). Biểu tượng gạch chéo khi mật khẩu đang hiện, để biết bấm sẽ ẩn đi. */
export function LoginPasswordField({ id, label, autoComplete, invalid, describedBy }: { id: string; label: string; autoComplete: string } & FieldA11y) {
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
          enterKeyHint="go"
          required
          aria-invalid={invalid}
          aria-describedby={invalid ? describedBy : undefined}
          className={`${inputClass} flex-1 pr-14`}
        />
        <button
          type="button"
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          onClick={() => setShow((v) => !v)}
          className={`absolute right-1 top-1 flex size-11 cursor-pointer items-center justify-center rounded-[12px] border-0 bg-transparent p-0 text-muted active:bg-inner ${focusRing}`}
        >
          <EyeIcon open={!show} />
        </button>
      </div>
    </div>
  )
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}

/** Dòng lỗi của form: nền cảnh báo đỏ ấm, biểu tượng, và (nếu có) cách gỡ ở dòng dưới. */
export function LoginError({ id, message, hint }: { id: string; message: string | null; hint?: string | null }) {
  return (
    <div id={id} role="alert" className="empty:hidden">
      {message && (
        <div className="flex gap-2.5 rounded-[14px] bg-danger-bg px-3.5 py-3 text-danger-fg">
          <AlertIcon />
          <div className="flex flex-col gap-0.5">
            <p className="m-0 text-[14px] font-semibold leading-[1.4]">{message}</p>
            {hint && <p className="m-0 text-[13px] leading-[1.4] text-text">{hint}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export function LoginSubmit({ pending, label = 'Đăng nhập', pendingLabel = 'Đang đăng nhập…' }: { pending: boolean; label?: string; pendingLabel?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`mt-1 flex h-[54px] cursor-pointer items-center justify-center rounded-[27px] border-0 bg-accent font-[inherit] text-[17px] font-bold text-on-solid shadow-[0_8px_24px_rgba(232,131,58,0.28)] transition-transform active:scale-[.97] active:bg-accent-press disabled:cursor-default disabled:opacity-60 [-webkit-tap-highlight-color:transparent] ${focusRing}`}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

/** Dòng "hoặc" ngăn giữa form mật khẩu và nút đăng nhập bằng Google. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted" role="separator" aria-label="hoặc">
      <span aria-hidden="true" className="h-px flex-1 bg-line2" />
      hoặc
      <span aria-hidden="true" className="h-px flex-1 bg-line2" />
    </div>
  )
}

/** Logo "G" nhiều màu theo quy định thương hiệu của Google (không đổi màu theo giao diện sáng/tối). */
function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.9 7.35 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function GoogleButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[50px] cursor-pointer items-center justify-center gap-2.5 rounded-[25px] border border-line2 bg-transparent font-[inherit] text-[15px] font-semibold text-text transition-transform active:scale-[.97] active:bg-inner disabled:cursor-default disabled:opacity-60 [-webkit-tap-highlight-color:transparent] ${focusRing}`}
    >
      <GoogleGlyph />
      {children}
    </button>
  )
}

export function PasskeyButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[50px] cursor-pointer items-center justify-center gap-2.5 rounded-[25px] border border-line2 bg-transparent font-[inherit] text-[15px] font-semibold text-text transition-transform active:scale-[.97] active:bg-inner disabled:cursor-default disabled:opacity-60 [-webkit-tap-highlight-color:transparent] ${focusRing}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="15" r="4" />
        <path d="m10.8 12.2 8.2-8.2" />
        <path d="m16 7 3 3" />
        <path d="m19 4 2 2" />
      </svg>
      {children}
    </button>
  )
}
