import { model, Schema } from 'mongoose'
import { TBookings, TBookingsModules } from './booking.interface'
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  SESSION_TYPE,
} from './booking.constants'

const bookingsSchema = new Schema<TBookings>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    consult: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String,
    },
    startTime: {
      type: String,
    },
    endTime: {
      type: String,
    },
    bufferTime: {
      type: Number,
      default: 0,
    },
    startAt: {
      type: Date,
    },
    endAt: {
      type: Date,
    },
    bufferEndAt: {
      type: Date,
    },
    sessionType: {
      type: String,
      enum: Object.values(SESSION_TYPE),
      required: true,
    },
    sessionDuration: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    isExpertVatRegistered: {
      type: Boolean,
      default: false,
    },
    sessionStartedAt: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      required: true,
    },
    mainQuestion: {
      type: String,
      required: true,
    },
    challengeQuestion: {
      type: String,
      required: true,
    },
    backgroundQuestion: {
      type: String,
      required: true,
    },
    recordDuration: {
      type: Number,
      default: 0,
    },
    recordFile: {
      type: String,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.unpaid,
    },
    dmCloseTime: {
      type: Date,
      default: null,
    },

    // For local time calculation
    localDate: {
      type: String,
    },
    localTime: {
      type: String,
    },
    localStartTime: {
      type: String,
    },
    localEndTime: {
      type: String,
    },
    
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.pending,
    },
    respondedAt: {
      type: Date,
    },
    is10MinReminderSent: {
      type: Boolean,
      default: false,
    },
    isJoinCallReminderSent: {
      type: Boolean,
      default: false,
    },
    lastPendingReminderSentAt: {
      type: Date,
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete (ret as any).sessionStartedAt
        delete (ret as any).dmCloseTime
        delete (ret as any).localTime
        return ret
      },
    },
    toObject: {
      transform: (_doc, ret) => {
        delete (ret as any).sessionStartedAt
        delete (ret as any).dmCloseTime
        delete (ret as any).localTime
        return ret
      },
    },
  },
)

export const Booking = model<TBookings, TBookingsModules>(
  'Booking',
  bookingsSchema,
)
