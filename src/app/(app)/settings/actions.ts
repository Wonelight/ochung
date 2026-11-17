'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { shuffleOwnAvatar, updateOwnProfile } from '@/server/account'
import { getActor } from '@/server/actor'
import { runAction } from '@/server/action-result'

/** Chỉ nhận tên hiển thị và ngày sinh; hành động luôn ghi cho chính người đăng nhập (getActor), không nhận id từ client. */
export async function saveProfileAction(input: { name: string; dob: string }) {
  return runAction(async () => {
    const actor = await getActor()
    await updateOwnProfile(db, actor, { name: input.name, dob: input.dob })
    revalidatePath('/', 'layout')
  })
}

export async function shuffleAvatarAction() {
  return runAction(async () => {
    const actor = await getActor()
    const avatarVariant = await shuffleOwnAvatar(db, actor)
    revalidatePath('/', 'layout')
    return { avatarVariant }
  })
}
