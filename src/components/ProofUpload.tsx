'use client'

import { useRef, useState } from 'react'
import { PROOF_MAX_BYTES } from '@/lib/proof'

// Đính kèm ảnh chuyển khoản (không bắt buộc): chọn ảnh → nén ở trình duyệt (cạnh dài nhất 1280px, JPEG ~0,8, thử lại 0,6 nếu
// còn quá 1 MB) → tải lên /api/upload ngay → trả địa chỉ ảnh cho người gọi. Không có BLOB_READ_WRITE_TOKEN thì trang cha không hiện thành phần này.

const MAX_SIDE = 1280

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.fillStyle = '#ffffff' // ảnh PNG trong suốt không bị nền đen khi sang JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.8, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= PROOF_MAX_BYTES) return blob
    }
    throw new Error('size')
  } finally {
    bitmap.close()
  }
}

export function ProofUpload({
  periodId,
  onChange,
  onBusy,
  disabled = false,
}: {
  periodId: string
  /** Địa chỉ ảnh đã tải lên, hoặc null khi bỏ ảnh. */
  onChange: (url: string | null) => void
  onBusy: (busy: boolean) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    setError(null)
    setBusy(true)
    onBusy(true)
    onChange(null)
    setName(null)
    try {
      let blob: Blob
      try {
        blob = await compress(file)
      } catch {
        setError('Không đọc hoặc nén được ảnh này. Hãy chọn ảnh JPEG hoặc PNG khác')
        return
      }
      const form = new FormData()
      form.set('file', new File([blob], 'proof.jpg', { type: 'image/jpeg' }))
      form.set('periodId', periodId)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = (await res.json().catch(() => null)) as { url?: string; message?: string } | null
      if (!res.ok || !data?.url) {
        setError(data?.message ?? 'Không tải ảnh lên được, vui lòng thử lại')
        return
      }
      setName(file.name)
      onChange(data.url)
    } catch {
      setError('Không kết nối được. Hãy kiểm tra mạng rồi thử lại')
    } finally {
      setBusy(false)
      onBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function clear() {
    setName(null)
    setError(null)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
        }}
      />
      {name ? (
        <div className="flex min-h-12 items-center gap-3 rounded-[16px] border border-line2 bg-card px-3.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-accent-text">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{name}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={clear}
            className="flex h-11 cursor-pointer items-center border-0 bg-transparent px-1 font-[inherit] text-[14px] font-semibold text-muted disabled:opacity-60"
          >
            Bỏ ảnh
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-dashed border-line2 bg-transparent px-3.5 font-[inherit] text-[14px] font-semibold text-muted disabled:cursor-default disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 4h-5L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-3z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {busy ? 'Đang tải ảnh…' : 'Đính kèm ảnh chuyển khoản (không bắt buộc)'}
        </button>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] font-medium text-unpaid-fg">
          {error}
        </p>
      )}
    </div>
  )
}
