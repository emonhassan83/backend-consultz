import { model, Schema } from 'mongoose'
import { PAYMENT_SETTLEMENT_STATUS } from '../payment/payment.constant'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'

const withdrawManualHoldLogSchema = new Schema(
  {
    withdraw: { type: Schema.Types.ObjectId, ref: 'Withdraw', required: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['manual_hold', 'manual_release'],
      required: true,
    },
    reason: { type: String, required: true, trim: true },
    previousWithdrawStatus: {
      type: String,
      enum: Object.values(WITHDRAW_STATUS),
      required: true,
    },
    newWithdrawStatus: {
      type: String,
      enum: Object.values(WITHDRAW_STATUS),
      required: true,
    },
    previousSettlementStatus: {
      type: String,
      enum: Object.values(PAYMENT_SETTLEMENT_STATUS),
      required: true,
    },
    newSettlementStatus: {
      type: String,
      enum: Object.values(PAYMENT_SETTLEMENT_STATUS),
      required: true,
    },
  },
  { timestamps: true },
)

export const WithdrawManualHoldLog = model(
  'WithdrawManualHoldLog',
  withdrawManualHoldLogSchema,
)
