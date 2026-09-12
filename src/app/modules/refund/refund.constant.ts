export const REFUND_BY = {
  admin: 'admin',
  system: 'system',
} as const

export const REFUND_STATUS = {
  pending: 'pending',
  succeeded: 'succeeded',
  failed: 'failed',
} as const

export type TRefundBy = keyof typeof REFUND_BY
export type TRefundStatus = keyof typeof REFUND_STATUS
