/** Hạt giống của Avatar: lần đầu là chính tên, mỗi lần "Tạo hình mới" thêm `#<số lần>` (đúng như mockup `Cài đặt`). */
export function avatarSeed(name: string, variant: number): string {
  return variant > 0 ? `${name}#${variant}` : name
}
