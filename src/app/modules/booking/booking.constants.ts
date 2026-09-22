export const SESSION_TYPE = {
  introduction: 'introduction',
  discussion: 'discussion',
  deep_drive: 'deep_drive'
} as const

export const PAYMENT_STATUS = {
  unpaid: 'unpaid',
  authorized: 'authorized',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
  cancelled: 'cancelled',
} as const

export const BOOKING_STATUS = {
  pending: 'pending',
  declined: 'declined',
  confirmed: 'confirmed',
  running: 'running',
  completed: 'completed',
  not_responded: 'not_responded',
  cancelled: 'cancelled',
} as const

export const BOOKING_NO_SHOW_BY = {
  consultee: 'consultee',
  consultant: 'consultant',
  both: 'both',
} as const

export type TSessionType = keyof typeof SESSION_TYPE
export type TPaymentStatus = keyof typeof PAYMENT_STATUS
export type TBookingStatus = keyof typeof BOOKING_STATUS
export type TBookingNoShowBy = keyof typeof BOOKING_NO_SHOW_BY
