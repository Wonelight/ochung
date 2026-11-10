'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { AppError } from '@/lib/errors'
import { runAction } from '@/server/action-result'
import { getActor } from '@/server/actor'
import {
  addMemberByAccountCode,
  createInviteLink,
  decideJoinRequest,
  revokeInviteLink,
} from '@/server/invites'

// Các khối mời người của màn Quản lý nhà (chỉ chủ nhà; quyền kiểm lại ở src/server/invites.ts).
const refreshHouse = () => revalidatePath('/nha')

export async function createInviteLinkAction(houseId: string) {
  return runAction(async () => {
    const actor = await getActor()
    const link = await createInviteLink(db, actor, houseId)
    refreshHouse()
    return { id: link.id, url: link.url, expiresAt: link.expiresAt.toISOString() }
  })
}

export async function revokeInviteLinkAction(linkId: string) {
  return runAction(async () => {
    const actor = await getActor()
    await revokeInviteLink(db, actor, linkId)
    refreshHouse()
  })
}

export async function decideJoinRequestAction(requestId: string, decision: 'approve' | 'reject') {
  return runAction(async () => {
    if (decision !== 'approve' && decision !== 'reject') throw new AppError('INVALID', 'DECISION', 'Thao tác không hợp lệ')
    const actor = await getActor()
    await decideJoinRequest(db, actor, requestId, decision)
    revalidatePath('/', 'layout')
  })
}

export async function addMemberByAccountCodeAction(houseId: string, accountCode: string) {
  return runAction(async () => {
    const actor = await getActor()
    const member = await addMemberByAccountCode(db, actor, houseId, accountCode)
    revalidatePath('/', 'layout')
    return { displayName: member.displayName }
  })
}
