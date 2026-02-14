import { Types } from 'mongoose'

export enum modeType {
  Auth = 'Auth',
  User = 'User',
  Follow = 'Follow',
  Feed = 'Feed',
  Comment = 'Comment',
  Booking = 'Booking',
  Calling = 'Calling',
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
