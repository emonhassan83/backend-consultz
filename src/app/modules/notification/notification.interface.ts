import { Types } from 'mongoose'

export enum modeType {
  Auth = 'Auth',
  User = 'User',
  Comment = 'Comment',
  WaitList = 'WaitList',
  Support = 'Support',
  Subscription = 'Subscription',
  Payment = 'Payment',
}

export type TNotification = {
  receiver?: Types.ObjectId | string
  message: string
  description?: string
  reference?: Types.ObjectId | string
  modelType?: modeType
  date?: Date
  read?: boolean
  isDeleted?: boolean
}
