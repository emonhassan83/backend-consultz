import { Model, ObjectId, Types } from 'mongoose'
import { TBookingStatus, TPaymentStatus, TSessionType } from './booking.constants'

export interface TBookings {
  _id?: ObjectId | string
  user: Types.ObjectId
  consult: Types.ObjectId
  slot: Types.ObjectId
  sessionType: TSessionType
  sessionDuration: number
  price: number
  timezone: string
  mainQuestion: string
  challengeQuestion: string
  backgroundQuestion: string
  paymentStatus: TPaymentStatus
  recordDuration: number
  recordFile: string
  status: TBookingStatus
  isDeleted: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type TBookingsModules = Model<TBookings, Record<string, unknown>>
