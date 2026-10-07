export enum PAYMENT_STATUS {
  unpaid = 'unpaid',
  authorized = 'authorized',
  paid = 'paid',
  partial_refund = 'partial_refund',
  refunded = 'refunded',
  failed = 'failed',
  cancelled = 'cancelled',
}

export enum PAYMENT_SETTLEMENT_STATUS {
  authorization_held = 'authorization_held',
  authorization_released = 'authorization_released',
  pending_session = 'pending_session',
  held = 'held',
  cleared = 'cleared',
  withdrawn = 'withdrawn',
  refunded = 'refunded',
}

export type TPaymentStatus = keyof typeof PAYMENT_STATUS
export type TPaymentSettlementStatus = keyof typeof PAYMENT_SETTLEMENT_STATUS
