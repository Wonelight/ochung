'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { signOutClient } from '@/lib/sign-out'
import { createUserAction, resetPasswordAction, setBannedAction } from './actions'

type UserRow = {
  id: string
  username: string
  displayName: string
  accountCode: string
  banned: boolean
  role: 'admin' | 'user'
}

/** Mật khẩu tạm vừa sinh: chỉ nằm trong state của trang này, đóng/tải lại là mất. */
type Notice = { kind: 'password'; title: string; password: string } | { kind: 'error'; message: string }

const inputClass =
  'h-12 w-full rounded-[14px] border border-line2 bg-input px-4 font-[inherit] text-[16px] text-text outline-none focus:border-accent'
const ghostButton =
  'h-11 cursor-pointer rounded-[22px] border border-line2 bg-transparent px-4 font-[inherit] text-[14px] font-semibold text-text disabled:cursor-default disabled:opacity-50'

export function AdminPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [copied, setCopied] = useState(false)

  function run(task: () => Promise<void>) {
    setNotice(null)
    setCopied(false)
    startTransition(task)
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const data = new FormData(formEl)
    run(async () => {
      const res = await createUserAction({
        username: String(data.get('username') ?? ''),
        displayName: String(data.get('displayName') ?? ''),
      })
      if (!res.ok) return setNotice({ kind: 'error', message: res.message })
      formEl.reset()
      setNotice({
        kind: 'password',
        title: `Đã tạo ${res.data.username} (mã ${res.data.accountCode}). Mật khẩu tạm`,
        password: res.data.tempPassword,
      })
    })
  }

  function onReset(u: UserRow) {
    if (!window.confirm(`Đặt lại mật khẩu cho ${u.displayName}? Mọi phiên đăng nhập của họ sẽ bị đăng xuất.`)) return
    run(async () => {
      const res = await resetPasswordAction(u.id)
      if (!res.ok) return setNotice({ kind: 'error', message: res.message })
      setNotice({ kind: 'password', title: `Mật khẩu tạm mới của ${u.username}`, password: res.data.tempPassword })
    })
  }

  function onToggleBan(u: UserRow) {
    const verb = u.banned ? 'Mở khóa' : 'Khóa'
    if (!window.confirm(`${verb} tài khoản ${u.displayName}?`)) return
    run(async () => {
      const res = await setBannedAction(u.id, !u.banned)
      if (!res.ok) setNotice({ kind: 'error', message: res.message })
    })
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function onSignOut() {
    await signOutClient()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 md:max-w-[1040px] pb-[max(40px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="m-0 font-numeric text-[20px] font-semibold uppercase tracking-[0.12em]">Quản trị</h1>
          <p className="m-0 mt-1 text-[13px] text-muted">{users.length} tài khoản</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className={`${ghostButton} flex items-center no-underline`}>
            Trang chủ
          </Link>
          <button type="button" onClick={onSignOut} className={ghostButton}>
            Đăng xuất
          </button>
        </div>
      </header>

      {notice?.kind === 'password' && (
        <section role="status" className="mt-5 rounded-[18px] border border-accent bg-card p-4">
          <p className="m-0 text-[13px] font-semibold text-muted">{notice.title}</p>
          <p className="m-0 mt-2 select-all break-all font-numeric text-[22px] font-semibold tracking-[0.06em]">{notice.password}</p>
          <p className="m-0 mt-2 text-[13px] text-muted">Chỉ hiện một lần. Hãy gửi cho thành viên; họ sẽ phải đổi ngay khi đăng nhập.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => copyPassword(notice.password)} className={ghostButton}>
              {copied ? 'Đã chép' : 'Chép mật khẩu'}
            </button>
            <button type="button" onClick={() => setNotice(null)} className={ghostButton}>
              Đóng
            </button>
          </div>
        </section>
      )}
      {notice?.kind === 'error' && (
        <p role="alert" className="mt-5 rounded-[14px] bg-unpaid-bg px-4 py-3 text-[14px] font-medium text-unpaid-fg">
          {notice.message}
        </p>
      )}

      <section className="mt-6 rounded-[18px] border border-line bg-card p-4">
        <h2 className="m-0 text-[15px] font-semibold">Tạo tài khoản</h2>
        <form onSubmit={onCreate} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-[13px] font-semibold text-muted">
              Tên đăng nhập
            </label>
            <input
              id="username"
              name="username"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="vd. minh.pham"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="displayName" className="text-[13px] font-semibold text-muted">
              Tên hiển thị
            </label>
            <input id="displayName" name="displayName" required maxLength={50} placeholder="vd. Phạm Minh" className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-12 cursor-pointer rounded-[24px] border-0 bg-accent font-[inherit] text-[16px] font-bold text-[#1A0F06] disabled:cursor-default disabled:opacity-60"
          >
            {pending ? 'Đang xử lý…' : 'Tạo tài khoản'}
          </button>
          <p className="m-0 text-[13px] text-muted">Mật khẩu tạm được tạo tự động và hiện một lần sau khi tạo.</p>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="m-0 text-[15px] font-semibold">Danh sách tài khoản</h2>
        <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0 md:hidden">
          {users.map((u) => (
            <li key={u.id} className="rounded-[18px] border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[16px] font-semibold">{u.displayName}</p>
                  <p className="m-0 mt-0.5 truncate text-[13px] text-muted">
                    {u.username} · {u.accountCode}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {u.role === 'admin' && (
                    <span className="rounded-full bg-rent-bg px-2.5 py-1 text-[12px] font-semibold text-rent-fg">Quản trị</span>
                  )}
                  {u.banned && (
                    <span className="rounded-full bg-unpaid-bg px-2.5 py-1 text-[12px] font-semibold text-unpaid-fg">Đã khóa</span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => onReset(u)} className={ghostButton}>
                  Đặt lại mật khẩu
                </button>
                {u.id !== currentUserId && (
                  <button type="button" disabled={pending} onClick={() => onToggleBan(u)} className={ghostButton}>
                    {u.banned ? 'Mở khóa' : 'Khóa'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden overflow-x-auto rounded-[18px] border border-line bg-card md:block">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                <th scope="col" className="px-4 py-3">Tên hiển thị</th>
                <th scope="col" className="px-4 py-3">Tên đăng nhập</th>
                <th scope="col" className="px-4 py-3">Mã tài khoản</th>
                <th scope="col" className="px-4 py-3">Trạng thái</th>
                <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-b-0">
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-[15px] font-semibold">{u.displayName}</td>
                  <td className="px-4 py-2.5 text-muted">{u.username}</td>
                  <td className="px-4 py-2.5 font-numeric text-[13px] tracking-[0.04em]">{u.accountCode}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      {u.role === 'admin' && (
                        <span className="rounded-full bg-rent-bg px-2.5 py-1 text-[12px] font-semibold text-rent-fg">Quản trị</span>
                      )}
                      {u.banned && (
                        <span className="rounded-full bg-unpaid-bg px-2.5 py-1 text-[12px] font-semibold text-unpaid-fg">Đã khóa</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={pending} onClick={() => onReset(u)} className={ghostButton}>
                        Đặt lại mật khẩu
                      </button>
                      {u.id !== currentUserId && (
                        <button type="button" disabled={pending} onClick={() => onToggleBan(u)} className={ghostButton}>
                          {u.banned ? 'Mở khóa' : 'Khóa'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
