'use client'

import { useState } from 'react'
import { ACCOUNT_NAME_MAX, ACCOUNT_NO_MAX, BANKS, findBank, normalizeAccountName } from '@/lib/banks'
import { saveBankInfoAction, saveDueDayAction } from '../actions'
import {
  ErrorText,
  FieldLabel,
  NoticeText,
  formCardClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  useSave,
} from './settings-parts'

/**
 * Tên chủ tài khoản viết hoa, không dấu (VietQR yêu cầu) ngay lúc gõ.
 * `normalizeAccountName` cắt khoảng trắng cuối nên giữ lại một dấu cách cuối để gõ được từ tiếp theo.
 */
const liveName = (raw: string) => normalizeAccountName(raw) + (/\s$/.test(raw) && raw.trim() !== '' ? ' ' : '')

/** "Ngân hàng": chọn ngân hàng (mã BIN NAPAS lưu trong repo), số tài khoản, tên chủ tài khoản. Dùng cho mã QR chuyển khoản. */
export function BankSettings({
  houseId,
  bankBin,
  accountNo,
  accountName,
}: {
  houseId: string
  bankBin: string | null
  accountNo: string | null
  accountName: string | null
}) {
  const [bin, setBin] = useState(bankBin ?? '')
  const [no, setNo] = useState(accountNo ?? '')
  const [name, setName] = useState(accountName ?? '')
  const { busy, error, notice, run, reset } = useSave()
  const hasSaved = bankBin !== null
  const bank = findBank(bin)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await run(() => saveBankInfoAction(houseId, { bankBin: bin, accountNo: no, accountName: name }), 'Đã lưu')
  }

  async function onClear() {
    const res = await run(() => saveBankInfoAction(houseId, { bankBin: null, accountNo: null, accountName: null }), 'Đã xóa thông tin ngân hàng')
    if (res) {
      setBin('')
      setNo('')
      setName('')
    }
  }

  return (
    <form onSubmit={onSubmit} className={formCardClass} aria-label="Ngân hàng">
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="bank-bin">Ngân hàng</FieldLabel>
        <select
          id="bank-bin"
          value={bin}
          onChange={(e) => {
            reset()
            setBin(e.target.value)
          }}
          className={`${inputClass} w-full appearance-none`}
        >
          <option value="">Chọn ngân hàng</option>
          {BANKS.map((b) => (
            <option key={b.bin} value={b.bin}>
              {b.short}
            </option>
          ))}
        </select>
        {bank && <span className="text-[12px] leading-snug text-muted">{bank.name} · mã {bank.bin}</span>}
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="bank-no">Số tài khoản</FieldLabel>
        <input
          id="bank-no"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="VD: 0123456789"
          value={no}
          onChange={(e) => setNo(e.target.value.replace(/\D/g, '').slice(0, ACCOUNT_NO_MAX))}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="bank-name">Tên chủ tài khoản</FieldLabel>
        <input
          id="bank-name"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="VD: NGUYEN VAN A"
          value={name}
          onChange={(e) => setName(liveName(e.target.value).slice(0, ACCOUNT_NAME_MAX))}
          className={inputClass}
        />
        <span className="text-[12px] leading-snug text-muted">Viết hoa, không dấu, đúng như trên tài khoản ngân hàng.</span>
      </div>
      <ErrorText>{error}</ErrorText>
      <NoticeText>{notice}</NoticeText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
        {hasSaved && (
          <button type="button" disabled={busy} onClick={onClear} className={ghostButtonClass}>
            Xóa thông tin
          </button>
        )}
      </div>
    </form>
  )
}

/** "Hạn đóng": ngày 1–28 hằng tháng. */
export function DueDaySetting({ houseId, dueDay }: { houseId: string; dueDay: number }) {
  const [text, setText] = useState(String(dueDay))
  const { busy, error, notice, run, setError, reset } = useSave()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(text)
    if (!/^\d{1,2}$/.test(text) || n < 1 || n > 28) return setError('Hạn đóng là ngày từ 1 đến 28 trong tháng')
    await run(() => saveDueDayAction(houseId, n), 'Đã lưu')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <FieldLabel htmlFor="due-day">Hạn đóng (ngày 1–28 hằng tháng)</FieldLabel>
      <div className="flex gap-2">
        <input
          id="due-day"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            reset()
            setText(e.target.value.replace(/\D/g, '').slice(0, 2))
          }}
          className={`${inputClass} w-24 text-center`}
        />
        <button type="submit" disabled={busy} className={`${primaryButtonClass} h-[50px]`}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
      <NoticeText>{notice}</NoticeText>
    </form>
  )
}
