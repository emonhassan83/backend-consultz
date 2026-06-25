import { Types } from 'mongoose'
import { TPaymentStatus } from './payment.constant'

export type TPayment = {
  _id: string
  id: string
  account: Types.ObjectId
  booking: Types.ObjectId
  transactionId: string
  paymentIntentId: string
  platformCommission: number
  consultAmount: number
  vat: number
  amount: number
  status: TPaymentStatus
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
