import { Model, ObjectId, Types } from 'mongoose'
import { TBookingStatus, TPaymentStatus } from './booking.constants'

export interface TBookings {
  _id?: ObjectId | string
  user: Types.ObjectId
  session: Types.ObjectId
  slot: Types.ObjectId
  credit: number
  paymentStatus: TPaymentStatus
  status: TBookingStatus
  isDeleted: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type TBookingsModules = Model<TBookings, Record<string, unknown>>
