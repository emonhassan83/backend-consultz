export const PAYMENT_STATUS = {
  unpaid: 'unpaid',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
} as const

export const BOOKING_STATUS = {
  pending: 'pending',
  confirmed: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
} as const

export type TPaymentStatus = keyof typeof PAYMENT_STATUS
export type TBookingStatus = keyof typeof BOOKING_STATUS