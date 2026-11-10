'use server'

import { headers } from 'next/headers'
import { db } from '@/db'
import { changeOwnPassword } from '@/server/account'
import { runAction } from '@/server/action-result'

export async function changePasswordAction(input: { currentPassword: string; newPassword: string }) {
  return runAction(async () => changeOwnPassword(db, await headers(), input))
}
