import { PAYMENT_STATUS, TPaymentStatus } from './payment.constant'

export const REFUNDABLE_PAYMENT_STATUSES: TPaymentStatus[] = [
  PAYMENT_STATUS.paid,
  PAYMENT_STATUS.partial_refund,
]

export const isRefundablePaymentStatus = (status: TPaymentStatus | string) =>
  REFUNDABLE_PAYMENT_STATUSES.includes(status as TPaymentStatus)

export const getPaymentStatusAfterRefund = (isFullRefundAfterThis: boolean) =>
  isFullRefundAfterThis
    ? PAYMENT_STATUS.refunded
    : PAYMENT_STATUS.partial_refund
