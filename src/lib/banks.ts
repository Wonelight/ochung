// Danh sách ngân hàng cho mã QR VietQR: mã BIN do NAPAS cấp, lưu tĩnh trong repo.
// Thêm ngân hàng mới chỉ cần thêm một dòng; `bin` là khóa duy nhất.

export type Bank = { bin: string; short: string; name: string }

export const BANKS: readonly Bank[] = [
  { bin: '970436', short: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', short: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', short: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', short: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970407', short: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970422', short: 'MB', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970416', short: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', short: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', short: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', short: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970441', short: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970437', short: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
  { bin: '970443', short: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970448', short: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970426', short: 'MSB', name: 'Ngân hàng TMCP Hàng hải Việt Nam' },
  { bin: '970440', short: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970431', short: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970449', short: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970428', short: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970409', short: 'Bac A Bank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '546034', short: 'Cake', name: 'Ngân hàng số Cake by VPBank' },
  { bin: '963388', short: 'Timo', name: 'Ngân hàng số Timo' },
  { bin: '970433', short: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970425', short: 'ABBANK', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970412', short: 'PVcomBank', name: 'Ngân hàng TMCP Đại chúng Việt Nam' },
]

export function findBank(bin: string | null | undefined): Bank | undefined {
  return bin ? BANKS.find((b) => b.bin === bin) : undefined
}

export const ACCOUNT_NO_MIN = 6
export const ACCOUNT_NO_MAX = 19
/** MỘT quy tắc số tài khoản cho cả cài đặt nhà, kiểm tra ở server và mã QR. */
export const ACCOUNT_NO_PATTERN = new RegExp(String.raw`^\d{${ACCOUNT_NO_MIN},${ACCOUNT_NO_MAX}}$`)
export const ACCOUNT_NAME_MAX = 50

/** VietQR yêu cầu tên chủ tài khoản viết hoa, không dấu: "Nguyễn Văn Đạt" -> "NGUYEN VAN DAT". */
export function normalizeAccountName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}
