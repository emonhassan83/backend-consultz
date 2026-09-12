import { model, Schema } from 'mongoose'
import { REFUND_BY, REFUND_STATUS } from './refund.constant'
import { TRefund } from './refund.interface'

const refundSchema = new Schema<TRefund>(
  {
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    refundedBy: {
      type: String,
      enum: Object.values(REFUND_BY),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(REFUND_STATUS),
      default: REFUND_STATUS.pending,
    },
    stripeRefundId: { type: String, default: null },
  },
  { timestamps: true },
)

export const Refund = model<TRefund>('Refund', refundSchema)
