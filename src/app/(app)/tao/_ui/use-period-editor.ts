'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { computePeriod } from '@/lib/billing/compute'
import type { PeriodResult } from '@/lib/billing/types'
import { AppError } from '@/lib/errors'
import {
  UTILITY_KEYS,
  diffEdits,
  editorStateOf,
  inputWithState,
  utilityInputOf,
  type EditorSnapshot,
  type EditorState,
  type PeriodEdits,
} from '@/lib/period-edits'
import { saveDraftAction } from '../actions'

export type Preview = { result: PeriodResult | null; problem: string | null }

const DEBOUNCE_MS = 300
const OFFLINE = 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại'
const UTILITY_LABEL = { electricity: 'Điện', water: 'Nước' } as const

/**
 * Số liệu đang sửa của màn Tạo hóa đơn.
 * - Tháng nháp: mỗi thay đổi được lưu (gom trong 300ms, chỉ gửi trường đã đổi) rồi tính thử bằng `previewPeriod`;
 *   các lần lưu chạy nối tiếp nhau, kết quả cũ về sau không đè kết quả mới. Server chỉ ghi khi tháng còn nháp:
 *   tháng vừa bị chốt ở nơi khác thì hiện lời báo (tải lại trang) và ngừng lưu tự động.
 * - Tháng đã chốt: chưa lưu gì cho tới khi bấm "Cập nhật" (mỗi lần sửa sau chốt là một lần báo cả nhà);
 *   số tổng tính ngay trên máy bằng đúng hàm `computePeriod` của server, từ bản chụp + số đang sửa.
 */
export function usePeriodEditor({
  periodId,
  snapshot,
  closed,
  initialPreview,
}: {
  periodId: string
  snapshot: EditorSnapshot
  closed: boolean
  initialPreview: Preview
}) {
  const [initial] = useState(() => editorStateOf(snapshot))
  const [state, setState] = useState(initial)
  const saved = useRef(initial)
  const latest = useRef(initial)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  /** Tháng vừa bị chốt ở nơi khác: ngừng hẳn lưu tự động (mỗi lần ghi vào tháng đã chốt là một lần báo cả nhà). */
  const stopped = useRef(false)
  const [serverPreview, setServerPreview] = useState(initialPreview)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * Lưu phần chưa lưu (tháng nháp); trả false nếu lưu không được (khi đó không được chốt sổ vì DB chưa có số mới).
   * `force`: tính thử lại kể cả khi không có gì đổi (sau khi thêm/sửa khoản chi).
   */
  const save = useCallback(
    (force = false): Promise<boolean> => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      const run = async (): Promise<boolean> => {
        if (stopped.current) return false
        const target = latest.current
        const edits = diffEdits(saved.current, target)
        if (!edits && !force) return true
        const mine = ++seq.current
        setSaving(true)
        try {
          const res = await saveDraftAction(periodId, edits)
          if (!res.ok) {
            setSaveError(res.message)
            return false
          }
          if (res.data.closedElsewhere) {
            stopped.current = true
            setSaveError(res.data.closedElsewhere)
            return false
          }
          saved.current = target
          setSaveError(null)
          if (mine === seq.current && latest.current === target) setServerPreview(res.data)
          return true
        } catch {
          setSaveError(OFFLINE)
          return false
        } finally {
          if (mine === seq.current) setSaving(false)
        }
      }
      const done = chain.current.then(run)
      chain.current = done.then(() => undefined)
      return done
    },
    [periodId],
  )

  const update = useCallback(
    (fn: (s: EditorState) => EditorState) => {
      const next = fn(latest.current)
      latest.current = next
      setState(next)
      if (closed || stopped.current) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), DEBOUNCE_MS)
    },
    [closed, save],
  )

  const localPreview = useMemo((): Preview | null => {
    if (!closed) return null
    try {
      return { result: computePeriod(inputWithState(snapshot, state)), problem: null }
    } catch (e) {
      return { result: null, problem: e instanceof AppError ? e.message : 'Không tính được hóa đơn' }
    }
  }, [closed, snapshot, state])

  /** Câu báo thiếu điện/nước, giống hệt câu server trả khi chốt sổ (UTILITY_MISSING). */
  const missing = useMemo(() => {
    const names = UTILITY_KEYS.filter((u) => utilityInputOf({ ...snapshot.utilities[u], ...state.utilities[u] }) === null).map(
      (u) => UTILITY_LABEL[u],
    )
    return names.length > 0 ? `Chưa nhập đủ số liệu ${names.join(' và ')}. Hãy nhập chỉ số (hoặc tổng tiền) trước khi chốt sổ` : null
  }, [snapshot, state])

  const pending: PeriodEdits | null = useMemo(() => (closed ? diffEdits(initial, state) : null), [closed, initial, state])

  return {
    state,
    update,
    save,
    saving,
    saveError,
    preview: localPreview ?? serverPreview,
    missing,
    pending,
  }
}
