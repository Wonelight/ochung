'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { submitTransferAction } from '@/app/(app)/hoa-don/actions'
import { formatVnd } from '@/lib/money'
import { ProofUpload } from './ProofUpload'
import { Sheet, sheetCtaClass } from './Sheet'

export type PayCta = {
  periodId: string
  /** "T11" */
  monthLabel: string
  /** Số còn phải chuyển (đồng, > 0). */
  amount: number
  /** Nội dung chuyển khoản, đã điền sẵn trong mã QR. */
  note: string
  /** null = chủ nhà chưa cài tài khoản ngân hàng. */
  bank: { name: string; accountNo: string; accountName: string } | null
  /** Ảnh mã QR (data URL SVG), null khi chưa có tài khoản ngân hàng. */
  qrImage: string | null
  /** Có token Vercel Blob → hiện ô đính kèm ảnh. */
  uploadEnabled: boolean
  /** Đã báo "Tôi đã chuyển", đang chờ chủ nhà xác nhận. */
  pending: boolean
  /** Lý do chủ nhà từ chối lần báo gần nhất (nếu lần gần nhất bị từ chối). */
  rejectedReason: string | null
}

/** Nút mở tấm Mã QR. `className` do trang quyết định (kiểu nút chính của Trang chủ hoặc nút to của Phiếu). */
export function QrSheetButton({ cta, className, children }: { cta: PayCta; className: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <QrSheet cta={cta} onClose={() => setOpen(false)} />}
    </>
  )
}

function CopyAccountButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // trình duyệt chặn clipboard: số tài khoản vẫn hiển thị để chép tay
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[14px] border border-line2 bg-inner px-3.5 font-[inherit] text-[14px] font-semibold text-text"
      >
        {copied ? 'Đã chép' : 'Sao chép'}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Đã sao chép số tài khoản' : ''}
      </span>
    </>
  )
}

function InfoRow({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex min-h-12 items-center justify-between gap-3 py-2 ${last ? '' : 'border-b border-line'}`}>
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[15px] font-semibold">{children}</span>
    </div>
  )
}

function QrSheet({ cta, onClose }: { cta: PayCta; onClose: () => void }) {
  const router = useRouter()
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await submitTransferAction(cta.periodId, proofUrl ? { proofUrl } : {})
      if (!res.ok) {
        setError(res.message)
        return
      }
      router.refresh()
      onClose()
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={`Chuyển khoản ${cta.monthLabel}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {error && (
            <p role="alert" className="m-0 text-[13px] font-medium leading-snug text-unpaid-fg">
              {error}
            </p>
          )}
          {cta.pending && !error && (
            <p className="m-0 text-[13px] leading-snug text-muted">Bạn đã báo chuyển khoản. Chủ nhà sẽ xác nhận khi nhận được tiền.</p>
          )}
          <button type="button" disabled={busy || uploading || cta.pending} onClick={submit} className={sheetCtaClass}>
            {busy ? 'Đang gửi…' : cta.pending ? 'Chờ chủ nhà xác nhận' : 'Tôi đã chuyển'}
          </button>
        </>
      }
    >
      {cta.rejectedReason && (
        <p role="status" className="m-0 rounded-[16px] bg-unpaid-bg px-3.5 py-3 text-[13px] leading-snug text-unpaid-fg">
          Chủ nhà đã từ chối lần báo trước: {cta.rejectedReason}
        </p>
      )}

      <div className="flex flex-col items-center gap-1">
        <span className="text-[13px] text-muted">Số tiền cần chuyển</span>
        <span className="font-numeric text-[28px] font-semibold tracking-[-0.04em] tabular-nums">{formatVnd(cta.amount)} đ</span>
      </div>

      {cta.qrImage ? (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-[20px] bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL SVG sinh ở server, không cần tối ưu ảnh */}
            <img src={cta.qrImage} alt="Mã QR VietQR chuyển khoản, đã điền sẵn số tiền và nội dung" width={208} height={208} className="block size-[208px]" />
          </div>
          <span className="text-center text-[12px] text-muted">Quét bằng app ngân hàng để chuyển, số tiền và nội dung đã điền sẵn</span>
        </div>
      ) : (
        !cta.bank && (
          <p role="status" className="m-0 rounded-[20px] border border-line bg-card p-4 text-center text-[14px] font-medium text-muted">
            Chủ nhà chưa cài tài khoản ngân hàng
          </p>
        )
      )}

      {cta.bank && (
        <section aria-label="Thông tin người nhận" className="flex flex-col rounded-[22px] border border-line bg-card px-4 py-1">
          <InfoRow label="Ngân hàng">{cta.bank.name}</InfoRow>
          <InfoRow label="Chủ tài khoản">{cta.bank.accountName}</InfoRow>
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-[13px] text-muted">Số tài khoản</span>
              <span className="font-numeric text-[17px] font-semibold tracking-[-0.02em] tabular-nums">{cta.bank.accountNo}</span>
            </div>
            <CopyAccountButton value={cta.bank.accountNo} />
          </div>
          <InfoRow label="Nội dung" last>
            {cta.note}
          </InfoRow>
        </section>
      )}

      {cta.uploadEnabled && !cta.pending && (
        <ProofUpload periodId={cta.periodId} onChange={setProofUrl} onBusy={setUploading} disabled={busy} />
      )}
    </Sheet>
  )
}
