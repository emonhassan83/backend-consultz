import { Types } from 'mongoose'
import { TRefundBy, TRefundStatus } from './refund.constant'

export type TRefund = {
  payment: Types.ObjectId
  booking: Types.ObjectId
  user: Types.ObjectId
  amount: number
  reason: string
  refundedBy: TRefundBy
  status: TRefundStatus
  stripeRefundId?: string | null
  createdAt?: Date
  updatedAt?: Date
}
