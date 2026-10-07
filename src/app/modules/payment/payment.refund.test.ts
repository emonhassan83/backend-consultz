import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PAYMENT_STATUS } from './payment.constant'
import {
  getPaymentStatusAfterRefund,
  isRefundablePaymentStatus,
} from './payment.refund.utils'
import { PaymentValidation } from './payment.validation'

describe('getPaymentStatusAfterRefund', () => {
  it('sets refunded when the remaining balance is fully refunded', () => {
    assert.equal(getPaymentStatusAfterRefund(true), PAYMENT_STATUS.refunded)
  })

  it('sets partial_refund when only part of the payment is refunded', () => {
    assert.equal(
      getPaymentStatusAfterRefund(false),
      PAYMENT_STATUS.partial_refund,
    )
  })

  it('allows another refund after a partial refund', () => {
    assert.equal(isRefundablePaymentStatus(PAYMENT_STATUS.partial_refund), true)
    assert.equal(isRefundablePaymentStatus(PAYMENT_STATUS.refunded), false)
  })
})

describe('refundValidationSchema reason', () => {
  const parse = (body: unknown) =>
    PaymentValidation.refundValidationSchema.safeParse({ body })

  it('rejects a missing reason', () => {
    const result = parse({ type: 'full' })
    assert.equal(result.success, false)
  })

  it('rejects an empty or whitespace-only reason', () => {
    const empty = parse({ type: 'full', reason: '' })
    const whitespace = parse({ type: 'full', reason: '   ' })
    assert.equal(empty.success, false)
    assert.equal(whitespace.success, false)
  })

  it('accepts a non-empty reason for a full refund', () => {
    const result = parse({ type: 'full', reason: 'duplicate charge' })
    assert.equal(result.success, true)
  })

  it('requires amount for a partial refund and keeps reason required', () => {
    const missingAmount = parse({
      type: 'partial',
      reason: 'goodwill',
    })
    const validPartial = parse({
      type: 'partial',
      amount: 10,
      reason: 'goodwill',
    })
    assert.equal(missingAmount.success, false)
    assert.equal(validPartial.success, true)
  })
})
