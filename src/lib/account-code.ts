import { randomInt } from 'node:crypto'

const MAX_ACCOUNT_CODE_ATTEMPTS = 20

/** Mã tài khoản `U-` + 5 chữ số, thử lại khi trùng (tối đa 20 lần). Chỉ dùng phía máy chủ. */
export async function generateAccountCode(exists: (code: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < MAX_ACCOUNT_CODE_ATTEMPTS; attempt++) {
    const code = `U-${String(randomInt(1, 100_000)).padStart(5, '0')}`
    if (!(await exists(code))) return code
  }
  throw new Error('Không sinh được mã tài khoản chưa dùng sau nhiều lần thử')
}
