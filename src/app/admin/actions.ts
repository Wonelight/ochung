'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import { adminCreateUser, adminResetPassword, adminSetBanned, generateTempPassword } from '@/server/admin'

/** Mật khẩu tạm do server sinh và chỉ trả về một lần cho quản trị viên đọc lại cho thành viên. */
export async function createUserAction(input: { username: string; displayName: string }) {
  return runAction(async () => {
    const actor = await getActor()
    const tempPassword = generateTempPassword()
    const { accountCode } = await adminCreateUser(db, actor, { ...input, tempPassword })
    revalidatePath('/admin')
    return { username: input.username.trim().toLowerCase(), accountCode, tempPassword }
  })
}

export async function resetPasswordAction(userId: string) {
  return runAction(async () => {
    const actor = await getActor()
    const tempPassword = generateTempPassword()
    await adminResetPassword(db, actor, userId, tempPassword)
    revalidatePath('/admin')
    return { tempPassword }
  })
}

export async function setBannedAction(userId: string, banned: boolean) {
  return runAction(async () => {
    const actor = await getActor()
    await adminSetBanned(db, actor, userId, banned)
    revalidatePath('/admin')
  })
}
