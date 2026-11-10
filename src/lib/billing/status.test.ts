import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { paymentStatus } from './status'

describe('paymentStatus', () => {
  it('chưa có giao dịch nào → unpaid', () => {
    expect(paymentStatus(2_600_000, [])).toEqual({
      kind: 'unpaid',
      balance: 2_600_000,
      confirmedIn: 0,
      confirmedOut: 0,
    })
  })

  it('có khoản in đang chờ → pending', () => {
    expect(
      paymentStatus(2_600_000, [{ direction: 'in', amount: 2_600_000, status: 'pending' }]).kind,
    ).toBe('pending')
  })

  it('in đã xác nhận đủ → paid', () => {
    expect(
      paymentStatus(2_600_000, [{ direction: 'in', amount: 2_600_000, status: 'confirmed' }]),
    ).toMatchObject({ kind: 'paid', balance: 0, confirmedIn: 2_600_000 })
  })

  it('in đã xác nhận một phần → partial', () => {
    expect(
      paymentStatus(2_600_000, [{ direction: 'in', amount: 1_000_000, status: 'confirmed' }]),
    ).toMatchObject({ kind: 'partial', balance: 1_600_000 })
  })

  it('đã xác nhận một phần và còn khoản chờ → pending', () => {
    expect(
      paymentStatus(2_600_000, [
        { direction: 'in', amount: 1_000_000, status: 'confirmed' },
        { direction: 'in', amount: 1_600_000, status: 'pending' },
      ]),
    ).toMatchObject({ kind: 'pending', balance: 1_600_000 })
  })

  it('bỏ qua bản ghi rejected', () => {
    expect(
      paymentStatus(2_600_000, [{ direction: 'in', amount: 2_600_000, status: 'rejected' }]).kind,
    ).toBe('unpaid')
    expect(
      paymentStatus(-300_000, [{ direction: 'out', amount: 300_000, status: 'rejected' }]),
    ).toMatchObject({ kind: 'owner_owes', balance: -300_000, confirmedOut: 0 })
  })

  it('due âm, chưa trả lại → owner_owes', () => {
    expect(paymentStatus(-300_000, [])).toMatchObject({ kind: 'owner_owes', balance: -300_000 })
  })

  it('due âm, chủ nhà đã trả lại và được xác nhận → paid', () => {
    expect(
      paymentStatus(-300_000, [{ direction: 'out', amount: 300_000, status: 'confirmed' }]),
    ).toMatchObject({ kind: 'paid', balance: 0, confirmedOut: 300_000 })
  })

  it('out đang chờ chưa được tính', () => {
    expect(
      paymentStatus(-300_000, [{ direction: 'out', amount: 300_000, status: 'pending' }]),
    ).toMatchObject({ kind: 'owner_owes', balance: -300_000, confirmedOut: 0 })
  })

  it('due giảm sau khi đã trả dư → owner_owes', () => {
    expect(
      paymentStatus(2_000_000, [{ direction: 'in', amount: 2_600_000, status: 'confirmed' }]),
    ).toMatchObject({ kind: 'owner_owes', balance: -600_000 })
  })

  it('due = 0 và không có giao dịch → paid', () => {
    expect(paymentStatus(0, []).kind).toBe('paid')
  })

  it('cộng dồn nhiều khoản đã xác nhận', () => {
    expect(
      paymentStatus(2_600_000, [
        { direction: 'in', amount: 1_000_000, status: 'confirmed' },
        { direction: 'in', amount: 1_600_000, status: 'confirmed' },
      ]).kind,
    ).toBe('paid')
  })

  it('từ chối số tiền không phải số nguyên đồng hoặc âm', () => {
    expect(() => paymentStatus(1.5, [])).toThrow(AppError)
    expect(() =>
      paymentStatus(100, [{ direction: 'in', amount: -1, status: 'confirmed' }]),
    ).toThrow(AppError)
    expect(() =>
      paymentStatus(100, [{ direction: 'in', amount: 0.5, status: 'pending' }]),
    ).toThrow(AppError)
  })
})
