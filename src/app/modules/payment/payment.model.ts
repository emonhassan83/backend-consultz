import { model, Schema } from 'mongoose'
import { TPayment } from './payment.interface'
import { generateCryptoString } from '../../utils/generateCryptoString'
import { PAYMENT_STATUS } from './payment.constant'

const paymentSchema = new Schema<TPayment>(
  {
    id: {
      type: String,
      unique: true,
      default: () => generateCryptoString(10),
    },
    account: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    transactionId: { type: String, required: true },
    isExpertVatRegistered: { type: Boolean, default: false },

    // What consultee pays
    consultationFee: { type: Number, default: 0 },   // Expert's net fee
    vat: { type: Number, default: 0 },               // VAT on expert's fee
    amount: { type: Number, min: 0, default: 0 },    // Total consultee pays

    // Platform breakdown
    platformCommission: { type: Number, default: 0 },
    platformVat: { type: Number, default: 0 },
    platformTotal: { type: Number, default: 0 },

    // Expert payout breakdown
    consultAmount: { type: Number, default: 0 },
    expertVatOwed: { type: Number, default: 0 },
    expertNet: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.unpaid,
    },
    paymentIntentId: {
      type: String,
      default: null,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

export const Payment = model<TPayment>('Payment', paymentSchema)
