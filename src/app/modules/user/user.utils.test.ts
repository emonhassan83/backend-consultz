import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getCancellationRates } from './user.utils'

describe('getCancellationRates', () => {
  it('returns lifetime and rolling 90-day cancellation rates as percentages', () => {
    const rates = getCancellationRates(10, 2, 4, 1)
    assert.equal(rates.cancellationRate, 20)
    assert.equal(rates.cancellationRateLast90Days, 25)
  })

  it('returns 0 when there are no bookings in that window', () => {
    const rates = getCancellationRates(0, 0, 0, 0)
    assert.equal(rates.cancellationRate, 0)
    assert.equal(rates.cancellationRateLast90Days, 0)
  })
})
