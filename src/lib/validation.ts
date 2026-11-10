import { z } from 'zod'
import { ACCOUNT_NAME_MAX, ACCOUNT_NO_MAX, ACCOUNT_NO_MIN, findBank, normalizeAccountName } from './banks'
import type { Tariff } from './billing/types'
import { AppError } from './errors'

export const NAME_MAX = 60
export const MAX_MONEY = 100_000_000_000 // 100 tỷ đồng: đủ cho mọi khoản nhà trọ, chặn nhập nhầm
export const MAX_QTY = 99
export const MAX_TIERS = 12
export const MAX_SURCHARGES = 6
export const MAX_REGISTERED_PEOPLE = 99

const money = (label: string) =>
  z
    .number({ error: `${label} phải là số` })
    .int(`${label} phải là số nguyên đồng`)
    .min(0, `${label} không được âm`)
    .max(MAX_MONEY, `${label} quá lớn`)

/** Phần trăm 0..100 với tối đa 1 chữ số thập phân (7,5 hợp lệ; 7,55 thì không). */
const pct = (label: string) =>
  z
    .number({ error: `${label} phải là số` })
    .min(0, `${label} phải từ 0 đến 100`)
    .max(100, `${label} phải từ 0 đến 100`)
    .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, `${label} chỉ được có tối đa 1 chữ số thập phân`)

const tierSchema = z.object({
  upTo: z
    .number({ error: 'Mốc bậc phải là số' })
    .int('Mốc bậc phải là số nguyên')
    .positive('Mốc bậc phải lớn hơn 0')
    .max(1_000_000, 'Mốc bậc quá lớn')
    .nullable(),
  price: money('Đơn giá'),
})

/**
 * Bảng giá bậc thang. Bậc cuối BẮT BUỘC không giới hạn (`upTo: null`) để lượng dùng vượt mốc vẫn được tính tiền;
 * chỉ bậc cuối được null, các mốc phải tăng nghiêm ngặt.
 * Chế độ "Nhập tổng" không dùng bảng này nên `setUtilityTariff` không bắt tariff khi `mode: 'total'`.
 */
export const tariffSchema: z.ZodType<Tariff> = z.object({
  tiers: z
    .array(tierSchema)
    .min(1, 'Cần ít nhất một bậc giá')
    .max(MAX_TIERS, `Tối đa ${MAX_TIERS} bậc giá`)
    .superRefine((tiers, ctx) => {
      let prev = 0
      tiers.forEach((t, i) => {
        const last = i === tiers.length - 1
        if (last) {
          if (t.upTo !== null) {
            ctx.addIssue({ code: 'custom', path: [i, 'upTo'], message: 'Bậc cuối phải không giới hạn (bỏ trống mốc)' })
          }
          return
        }
        if (t.upTo === null) {
          ctx.addIssue({ code: 'custom', path: [i, 'upTo'], message: 'Chỉ bậc cuối được bỏ trống mốc' })
          return
        }
        if (t.upTo <= prev) {
          ctx.addIssue({ code: 'custom', path: [i, 'upTo'], message: 'Mốc các bậc phải tăng dần' })
        }
        prev = t.upTo
      })
    }),
  perPerson: z.boolean({ error: 'Công tắc định mức theo số người không hợp lệ' }),
  registeredPeople: z
    .number({ error: 'Số người đăng ký phải là số' })
    .int('Số người đăng ký phải là số nguyên')
    .min(1, 'Số người đăng ký phải từ 1 trở lên')
    .max(MAX_REGISTERED_PEOPLE, 'Số người đăng ký quá lớn'),
  vatPct: pct('VAT'),
  surcharges: z
    .array(
      z.object({
        name: z.string({ error: 'Tên phụ phí không hợp lệ' }).trim().min(1, 'Tên phụ phí không được để trống').max(40, 'Tên phụ phí tối đa 40 ký tự'),
        pct: pct('Phụ phí'),
      }),
    )
    .max(MAX_SURCHARGES, `Tối đa ${MAX_SURCHARGES} phụ phí`),
})

export const chargeItemSchema = z.object({
  name: z.string({ error: 'Tên khoản không hợp lệ' }).trim().min(1, 'Tên khoản không được để trống').max(NAME_MAX, `Tên khoản tối đa ${NAME_MAX} ký tự`),
  kind: z.enum(['equal', 'per_unit'], { error: 'Cách chia không hợp lệ' }),
  amount: money('Số tiền'),
  active: z.boolean({ error: 'Trạng thái khoản không hợp lệ' }),
})

export const qtySchema = z
  .number({ error: 'Số lượng phải là số' })
  .int('Số lượng phải là số nguyên')
  .min(0, 'Số lượng không được âm')
  .max(MAX_QTY, `Số lượng tối đa ${MAX_QTY}`)

const accountNoSchema = z
  .string({ error: 'Số tài khoản không hợp lệ' })
  .transform((s) => s.replace(/[\s.-]/g, ''))
  .pipe(
    z
      .string()
      .regex(new RegExp(`^\\d{${ACCOUNT_NO_MIN},${ACCOUNT_NO_MAX}}$`), `Số tài khoản gồm ${ACCOUNT_NO_MIN}–${ACCOUNT_NO_MAX} chữ số`),
  )

const accountNameSchema = z
  .string({ error: 'Tên chủ tài khoản không hợp lệ' })
  .transform(normalizeAccountName)
  .pipe(
    z
      .string()
      .min(1, 'Tên chủ tài khoản không được để trống')
      .max(ACCOUNT_NAME_MAX, `Tên chủ tài khoản tối đa ${ACCOUNT_NAME_MAX} ký tự`)
      .regex(/^[A-Z0-9 .'-]+$/, 'Tên chủ tài khoản chỉ gồm chữ, số và khoảng trắng'),
  )

const bankBinSchema = z
  .string({ error: 'Hãy chọn ngân hàng' })
  .refine((bin) => findBank(bin) !== undefined, 'Ngân hàng không có trong danh sách')

const bankInfoSchema = z.object({ bankBin: bankBinSchema, accountNo: accountNoSchema, accountName: accountNameSchema })

export type BankInfoInput = { bankBin: string | null; accountNo: string | null; accountName: string | null }
export type BankInfo = { bankBin: string; accountNo: string; accountName: string }

const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === ''

/**
 * Hoặc đủ ba trường (hợp lệ, đã chuẩn hóa), hoặc cả ba trống (null = xóa thông tin).
 * Điền dở dang bị từ chối vì mã QR sẽ hỏng.
 */
export function parseBankInfo(input: BankInfoInput): BankInfo | null {
  const blanks = [input.bankBin, input.accountNo, input.accountName].filter(blank).length
  if (blanks === 3) return null
  if (blanks > 0) throw new AppError('INVALID', 'BANK_INCOMPLETE', 'Hãy chọn ngân hàng và điền đủ số tài khoản, tên chủ tài khoản')
  return parseOrThrow(bankInfoSchema, input, 'BANK_FIELD')
}

/** Chạy schema; sai thì ném AppError INVALID với câu lỗi đầu tiên (tiếng Việt). */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, reason: string): T {
  const res = schema.safeParse(input)
  if (res.success) return res.data
  throw new AppError('INVALID', reason, res.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
}
