import { describe, expect, it } from 'vitest'
import { expenseEditHref, expenseParam } from './ledger-edit'

describe('expenseEditHref (mở trang sửa từ bảng Chi tiêu tháng)', () => {
  const exp = (over: Partial<{ id: string; mine: boolean; paidByMemberId: string }> = {}) => ({ id: 'e1', mine: true, paidByMemberId: 'me', ...over })
  const owner = { canWrite: true, isOwner: true, status: 'draft' as const, periodId: 'p1', meId: 'own' }
  const member = { canWrite: true, isOwner: false, status: 'draft' as const, periodId: 'p1', meId: 'me' }

  it('chủ nhà sửa được mọi khoản, kể cả tháng đã chốt: mở tab Khoản chi lẻ của đúng tháng', () => {
    expect(expenseEditHref({ ...owner, expense: exp({ mine: false, paidByMemberId: 'an' }) })).toBe('/create?period=p1&tab=expense&expense=e1')
    expect(expenseEditHref({ ...owner, status: 'closed', expense: exp() })).toBe('/create?period=p1&tab=expense&expense=e1')
  })

  it('thành viên: chỉ khoản mình nhập, mình trả, tháng còn nháp', () => {
    expect(expenseEditHref({ ...member, expense: exp() })).toBe('/create?expense=e1')
    expect(expenseEditHref({ ...member, expense: exp({ mine: false }) })).toBeNull()
    expect(expenseEditHref({ ...member, expense: exp({ paidByMemberId: 'an' }) })).toBeNull() // chủ nhà đã đổi người trả
    expect(expenseEditHref({ ...member, status: 'closed', expense: exp() })).toBeNull()
  })

  it('nhà đã lưu trữ hoặc đã rời nhà: không sửa được gì', () => {
    expect(expenseEditHref({ ...owner, canWrite: false, expense: exp() })).toBeNull()
    expect(expenseEditHref({ ...member, canWrite: false, expense: exp() })).toBeNull()
  })
})

describe('expenseParam (?expense= của trang Tạo)', () => {
  it('nhận id dạng chuỗi ngắn, bỏ giá trị rỗng/mảng/quá dài', () => {
    expect(expenseParam('e1')).toBe('e1')
    expect([expenseParam(undefined), expenseParam(''), expenseParam(['e1']), expenseParam('x'.repeat(65))]).toEqual([null, null, null, null])
  })
})
