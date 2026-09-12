import { Types } from 'mongoose'
import {
  TPaymentSettlementStatus,
  TPaymentStatus,
} from './payment.constant'

export type TPayment = {
  _id: string
  id: string
  account: Types.ObjectId
  booking: Types.ObjectId
  transactionId?: string
  paymentIntentId: string
  isExpertVatRegistered: boolean

  // What consultee pays
  grossBookingValue: number
  consultationFee: number       // Expert's net fee (before VAT)
  consultantVat: number         // VAT on expert's fee (0 if not VAT registered)
  amount: number                // Total consultee pays (consultationFee + consultantVat)

  // Platform breakdown
  platformFeePercentage: number
  platformCommission: number    // Consultz net commission
  platformVat: number           // VAT on platform commission
  platformTotal: number         // Total Consultz keeps (commission + platformVat)
  platformTotalDeduction: number

  // Expert payout breakdown
  consultAmount: number         // Total paid to expert (amount - platformTotal)
  expertPayout: number
  expertVatOwed: number         // VAT expert must account to HMRC
  expertNet: number             // Expert's net earnings after HMRC (consultAmount - expertVatOwed)

  status: TPaymentStatus
  settlementStatus: TPaymentSettlementStatus
  holdUntil?: Date
  holdDaysSnapshot?: number
  clearedAt?: Date
  withdrawnAt?: Date
  authorizedAt?: Date
  authorizationExpiresAt?: Date
  capturedAt?: Date
  isPaid: boolean
  isDeleted: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface IPaymentIntent {
  booking: string
  account: string
}

export interface IConfirmPayment {
  paymentIntentId: string
  booking: string
  user: string
}
