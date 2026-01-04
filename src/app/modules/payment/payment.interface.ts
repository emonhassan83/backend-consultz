import { Types } from 'mongoose'
import { TPaymentStatus } from './payment.constant'

export type TPayment = {
  _id: string
  id: string
  account: Types.ObjectId
  booking: Types.ObjectId
  transactionId: string
  paymentIntentId: string
  amount: number
  status: TPaymentStatus
  isPaid: boolean
  isDeleted: boolean
  createdAt?: Date
  updatedAt?: Date
}
