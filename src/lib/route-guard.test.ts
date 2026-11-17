import { describe, expect, it } from 'vitest'
import { routeGuard, safeNext } from './route-guard'

const anon = { loggedIn: false, mustChangePassword: false, role: 'user' as const }
const member = { loggedIn: true, mustChangePassword: false, role: 'user' as const }
const admin = { loggedIn: true, mustChangePassword: false, role: 'admin' as const }
const fresh = { loggedIn: true, mustChangePassword: true, role: 'user' as const }

describe('routeGuard', () => {
  it('chưa đăng nhập: về /login, riêng /invite/<token> giữ lại next', () => {
    expect(routeGuard(anon, '/')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/admin')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/change-password')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/invite/abc')).toEqual({ redirect: '/login?next=%2Finvite%2Fabc' })
  })

  it('đường dẫn công khai khi chưa đăng nhập', () => {
    expect(routeGuard(anon, '/login')).toBeNull()
    expect(routeGuard(anon, '/forgot-password')).toBeNull()
    expect(routeGuard(anon, '/forgot-password/x')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/api/auth/sign-in/username')).toBeNull()
    expect(routeGuard(anon, '/_next/static/chunks/a.js')).toBeNull()
    expect(routeGuard(anon, '/favicon.ico')).toBeNull()
    expect(routeGuard(anon, '/manifest.webmanifest')).toBeNull()
  })

  it('phải đổi mật khẩu lần đầu: mọi trang khác bị chuyển sang /change-password', () => {
    expect(routeGuard(fresh, '/')).toEqual({ redirect: '/change-password' })
    expect(routeGuard(fresh, '/login')).toEqual({ redirect: '/change-password' })
    expect(routeGuard(fresh, '/change-password')).toBeNull()
    expect(routeGuard(fresh, '/api/auth/change-password')).toBeNull()
  })

  it('phải đổi mật khẩu khi đang mở link mời: giữ link qua /change-password?next=… để đổi xong vào nhà luôn', () => {
    expect(routeGuard(fresh, '/invite/abc')).toEqual({ redirect: '/change-password?next=%2Finvite%2Fabc' })
    expect(safeNext('/invite/abc')).toBe('/invite/abc')
  })

  it('admin cần mustChangePassword xong mới vào /admin', () => {
    expect(routeGuard({ ...admin, mustChangePassword: true }, '/admin')).toEqual({ redirect: '/change-password' })
  })

  it('/admin chỉ dành cho quản trị viên', () => {
    expect(routeGuard(member, '/admin')).toEqual({ redirect: '/' })
    expect(routeGuard(member, '/admin/nguoi-dung')).toEqual({ redirect: '/' })
    expect(routeGuard(admin, '/admin')).toBeNull()
    expect(routeGuard(admin, '/admin/nguoi-dung')).toBeNull()
  })

  it('đuôi tệp không mở cổng: /admin/x.json, /invite/abc.def vẫn bị chặn (miễn trừ tệp tĩnh chỉ ở proxy)', () => {
    expect(routeGuard(member, '/admin/x.json')).toEqual({ redirect: '/' })
    expect(routeGuard(anon, '/admin/x.json')).toEqual({ redirect: '/login' })
    expect(routeGuard(anon, '/invite/abc.def')).toEqual({ redirect: '/login?next=%2Finvite%2Fabc.def' })
    expect(routeGuard(fresh, '/x.png')).toEqual({ redirect: '/change-password' })
    expect(routeGuard(anon, '/favicon.ico')).toBeNull()
    expect(routeGuard(anon, '/manifest.webmanifest')).toBeNull()
  })

  it('không nhầm đường dẫn có tiền tố giống /admin', () => {
    expect(routeGuard(member, '/administrator')).toBeNull()
  })

  it('đã đăng nhập mà vào /login thì về /; /change-password vẫn vào được để đổi mật khẩu từ Cài đặt', () => {
    expect(routeGuard(member, '/login')).toEqual({ redirect: '/' })
    expect(routeGuard(member, '/change-password')).toBeNull()
  })

  it('người dùng thường vào các trang ứng dụng', () => {
    expect(routeGuard(member, '/')).toBeNull()
    expect(routeGuard(member, '/invite/abc')).toBeNull()
  })
})

describe('safeNext', () => {
  it('chỉ nhận đường dẫn tương đối cùng gốc', () => {
    expect(safeNext('/invite/abc')).toBe('/invite/abc')
    expect(safeNext('/invite/abc?x=1')).toBe('/invite/abc?x=1')
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
