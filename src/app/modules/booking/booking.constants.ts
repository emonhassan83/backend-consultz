export const SESSION_TYPE = {
  introduction: 'introduction',
  discussion: 'discussion',
  deep_drive: 'deep_drive'
} as const

export const PAYMENT_STATUS = {
  unpaid: 'unpaid',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
} as const

export const BOOKING_STATUS = {
  pending: 'pending',
  declined: 'declined',
  confirmed: 'confirmed',
  completed: 'completed',
  not_responded: 'not_responded',
  cancelled: 'cancelled',
} as const

export type TSessionType = keyof typeof SESSION_TYPE
export type TPaymentStatus = keyof typeof PAYMENT_STATUS
export type TBookingStatus = keyof typeof BOOKING_STATUS