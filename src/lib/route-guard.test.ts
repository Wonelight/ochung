import { describe, expect, it } from 'vitest'
import { routeGuard, safeNext } from './route-guard'

const anon = { loggedIn: false, mustChangePassword: false, role: 'user' as const }
const member = { loggedIn: true, mustChangePassword: false, role: 'user' as const }
const admin = { loggedIn: true, mustChangePassword: false, role: 'admin' as const }
const fresh = { loggedIn: true, mustChangePassword: true, role: 'user' as const }

describe('routeGuard', () => {
  it('chưa đăng nhập: về /login, riêng /moi/<token> giữ lại next', () => {
    expect(routeGuard(anon, '/')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/admin')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/doi-mat-khau')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/moi/abc')).toEqual({ redirect: '/login?next=%2Fmoi%2Fabc' })
  })

  it('đường dẫn công khai khi chưa đăng nhập', () => {
    expect(routeGuard(anon, '/login')).toBeNull()
    expect(routeGuard(anon, '/api/auth/sign-in/username')).toBeNull()
    expect(routeGuard(anon, '/_next/static/chunks/a.js')).toBeNull()
    expect(routeGuard(anon, '/favicon.ico')).toBeNull()
    expect(routeGuard(anon, '/manifest.webmanifest')).toBeNull()
  })

  it('phải đổi mật khẩu lần đầu: mọi trang khác bị chuyển sang /doi-mat-khau', () => {
    expect(routeGuard(fresh, '/')).toEqual({ redirect: '/doi-mat-khau' })
    expect(routeGuard(fresh, '/moi/abc')).toEqual({ redirect: '/doi-mat-khau' })
    expect(routeGuard(fresh, '/login')).toEqual({ redirect: '/doi-mat-khau' })
    expect(routeGuard(fresh, '/doi-mat-khau')).toBeNull()
    expect(routeGuard(fresh, '/api/auth/change-password')).toBeNull()
  })

  it('admin cần mustChangePassword xong mới vào /admin', () => {
    expect(routeGuard({ ...admin, mustChangePassword: true }, '/admin')).toEqual({ redirect: '/doi-mat-khau' })
  })

  it('/admin chỉ dành cho quản trị viên', () => {
    expect(routeGuard(member, '/admin')).toEqual({ redirect: '/' })
    expect(routeGuard(member, '/admin/nguoi-dung')).toEqual({ redirect: '/' })
    expect(routeGuard(admin, '/admin')).toBeNull()
    expect(routeGuard(admin, '/admin/nguoi-dung')).toBeNull()
  })

  it('không nhầm đường dẫn có tiền tố giống /admin', () => {
    expect(routeGuard(member, '/administrator')).toBeNull()
  })

  it('đã đăng nhập mà vào /login thì về /; vào /doi-mat-khau khi không bắt buộc cũng về /', () => {
    expect(routeGuard(member, '/login')).toEqual({ redirect: '/' })
    expect(routeGuard(member, '/doi-mat-khau')).toEqual({ redirect: '/' })
  })

  it('người dùng thường vào các trang ứng dụng', () => {
    expect(routeGuard(member, '/')).toBeNull()
    expect(routeGuard(member, '/moi/abc')).toBeNull()
  })
})

describe('safeNext', () => {
  it('chỉ nhận đường dẫn tương đối cùng gốc', () => {
    expect(safeNext('/moi/abc')).toBe('/moi/abc')
    expect(safeNext('/moi/abc?x=1')).toBe('/moi/abc?x=1')
  })

  it('từ chối URL tuyệt đối, protocol-relative và biến thể lách', () => {
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('/\\evil.com')).toBe('/')
    expect(safeNext('javascript:alert(1)')).toBe('/')
    expect(safeNext('moi/abc')).toBe('/')
    expect(safeNext('/a\nb')).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(null)).toBe('/')
    expect(safeNext('')).toBe('/')
  })

  it('không quay lại /login', () => {
    expect(safeNext('/login')).toBe('/')
    expect(safeNext('/login?next=/x')).toBe('/')
  })
})
