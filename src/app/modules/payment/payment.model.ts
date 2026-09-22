import { model, Schema } from 'mongoose'
import { TPayment } from './payment.interface'
import { generateCryptoString } from '../../utils/generateCryptoString'
import { PAYMENT_SETTLEMENT_STATUS, PAYMENT_STATUS } from './payment.constant'

const paymentSchema = new Schema<TPayment>(
  {
    id: {
      type: String,
      unique: true,
      default: () => generateCryptoString(10),
    },
    account: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    transactionId: { type: String, default: null },
    isExpertVatRegistered: { type: Boolean, default: false },

    // What consultee pays
    grossBookingValue: { type: Number, min: 0, default: 0 },
    consultationFee: { type: Number, default: 0 },   // Expert's net fee
    consultantVat: { type: Number, default: 0 },     // VAT on expert's fee
    amount: { type: Number, min: 0, default: 0 },    // Total consultee pays

    // Platform breakdown
    platformFeePercentage: { type: Number, default: 0 },
    platformCommission: { type: Number, default: 0 },
    platformVat: { type: Number, default: 0 },
    platformTotal: { type: Number, default: 0 },
    platformTotalDeduction: { type: Number, default: 0 },

    // Expert payout breakdown
    consultAmount: { type: Number, default: 0 },
    expertPayout: { type: Number, default: 0 },
    expertVatOwed: { type: Number, default: 0 },
    expertNet: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.unpaid,
    },
    settlementStatus: {
      type: String,
      enum: Object.values(PAYMENT_SETTLEMENT_STATUS),
      default: PAYMENT_SETTLEMENT_STATUS.pending_session,
    },
    holdUntil: { type: Date, default: null },
    holdDaysSnapshot: { type: Number, default: null },
    isManualHold: { type: Boolean, default: false },
    clearedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    authorizedAt: { type: Date, default: null },
    authorizationExpiresAt: { type: Date, default: null },
    capturedAt: { type: Date, default: null },
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
