import dayjs from 'dayjs'
import {
  PAYMENT_SETTLEMENT_STATUS,
  PAYMENT_STATUS,
} from '../modules/payment/payment.constant'
import { Payment } from '../modules/payment/payment.model'

export const paymentSettlementClearJob = async (): Promise<void> => {
  console.log('Payment Settlement Clear Job started')

  const now = dayjs().toDate()

  const result = await Payment.updateMany(
    {
      status: PAYMENT_STATUS.paid,
      isPaid: true,
      isDeleted: false,
      settlementStatus: PAYMENT_SETTLEMENT_STATUS.held,
      holdUntil: { $lte: now },
    },
    {
      $set: {
        settlementStatus: PAYMENT_SETTLEMENT_STATUS.cleared,
        clearedAt: now,
      },
    },
  )

  console.log(
    `Payment Settlement Clear Job done - ${result.modifiedCount || 0} payments cleared`,
  )
}
