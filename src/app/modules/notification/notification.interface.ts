import { Types } from 'mongoose'

export enum modeType {
  Auth = 'Auth',
  User = 'User',
  Feed = 'Feed',
  Comment = 'Comment',
  Booking = 'Booking',
  Reviews = 'Reviews',
  Payment = 'Payment',
  Withdraw = 'Withdraw',
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
