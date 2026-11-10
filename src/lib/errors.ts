export type AppErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'CONFLICT'

/** Lỗi nghiệp vụ: `reason` là mã máy đọc, `message` là câu tiếng Việt hiển thị cho người dùng. */
export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    public reason: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
