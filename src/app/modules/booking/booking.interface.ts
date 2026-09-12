import { Model, ObjectId, Types } from 'mongoose'
import { TBookingStatus, TPaymentStatus, TSessionType } from './booking.constants'

export type TBookingCancelledBy = 'consultee' | 'consultant' | 'system'

export interface TBookings {
  _id?: ObjectId | string
  id?: string | null
  user: Types.ObjectId
  consult: Types.ObjectId
  date?: string
  startTime?: string
  endTime?: string
  bufferTime?: number
  startAt?: Date
  endAt?: Date
  bufferEndAt?: Date
  localStartTime?: string
  localEndTime?: string
  sessionType: TSessionType
  sessionDuration: number
  price: number
  timezone?: string
  mainQuestion: string
  challengeQuestion: string
  backgroundQuestion: string
  isExpertVatRegistered: boolean
  sessionStartedAt?: Date
  paymentStatus: TPaymentStatus
  recordDuration: number
  recordFile: string
  dmCloseTime?: Date

  // For local time calculation
  localDate?: string
  localTime?: string
  
  status: TBookingStatus
  cancelledBy?: TBookingCancelledBy | null
  isDeleted: boolean
  respondedAt?: Date
  is10MinReminderSent?: boolean
  isJoinCallReminderSent?: boolean
  lastPendingReminderSentAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export type TBookingsModules = Model<TBookings, Record<string, unknown>>
