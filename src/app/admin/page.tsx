import type { Metadata } from 'next'
import { db } from '@/db'
import { getActor } from '@/server/actor'
import { adminListUsers } from '@/server/admin'
import { AdminPanel } from './admin-panel'

export const metadata: Metadata = { title: 'Quản trị — Chi tiêu nhà' }

export default async function AdminPage() {
  const actor = await getActor()
  const users = await adminListUsers(db, actor)
  return (
    <AdminPanel
      currentUserId={actor.userId}
      users={users.map((u) => ({
        id: u.id,
        username: u.username ?? '',
        displayName: u.displayName,
        accountCode: u.accountCode,
        banned: u.banned,
        role: u.role === 'admin' ? 'admin' : 'user',
      }))}
    />
  )
}
