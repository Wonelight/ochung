import { nanoid } from 'nanoid'

/** Khóa chính dạng chuỗi cho mọi bảng nghiệp vụ (Better Auth tự sinh id của bảng auth). */
export function newId(): string {
  return nanoid(21)
}
