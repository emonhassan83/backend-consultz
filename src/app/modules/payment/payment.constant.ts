export enum PAYMENT_STATUS {
  unpaid = 'unpaid',
  paid = 'paid',
  refunded = 'refunded',
  failed = 'failed',
}

export enum PAYMENT_SETTLEMENT_STATUS {
  pending_session = 'pending_session',
  held = 'held',
  cleared = 'cleared',
  withdrawn = 'withdrawn',
  refunded = 'refunded',
}

export type TPaymentStatus = keyof typeof PAYMENT_STATUS
export type TPaymentSettlementStatus = keyof typeof PAYMENT_SETTLEMENT_STATUS
