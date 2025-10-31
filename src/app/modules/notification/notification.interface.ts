import { Types } from 'mongoose'

export enum modeType {
  Auth = 'Auth',
  User = 'User',
  Deal = 'Deal',
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
