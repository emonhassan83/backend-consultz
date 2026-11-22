// Single place for session pricing (QA #32).
// The expert's hourlyRate is the only source of truth: the price shown on the
// profile and the price charged at booking both come from here.

const round2 = (value: number) => Number(value.toFixed(2))

export const calculateSessionPrice = (hourlyRate: number, duration: number) =>
  round2((hourlyRate / 60) * duration)

/**
 * Sets `offeredPrice` and `price` on every session duration from the hourly rate.
 * A stored `offeredPrice` is ignored, because it can be stale after a rate change.
 */
export const withSessionPrices = <T extends { duration: number }>(
  sessionDurations: T[] | null | undefined,
  hourlyRate: number | null | undefined,
): (T & { offeredPrice: number; price: number })[] => {
  const rate = typeof hourlyRate === 'number' && hourlyRate > 0 ? hourlyRate : 0
  return (sessionDurations || []).map((session) => {
    const price = calculateSessionPrice(rate, session.duration)
    return { ...session, offeredPrice: price, price }
  })
}

/**
 * What the consultee pays for a booking: consultation fee plus the expert's VAT.
 * `vatRate` is a percentage (20 = 20%), or null when the expert isn't VAT registered.
 * Rounding matches what createPaymentIntent did before the snapshot.
 */
export const calculateBookingTotal = (price: number, vatRate: number | null) => {
  const expertVat = vatRate ? round2(price * (vatRate / 100)) : 0
  return {
    expertVatRate: vatRate ?? null,
    expertVat,
    totalAmount: round2(price + expertVat),
  }
}
