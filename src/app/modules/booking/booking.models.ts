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
    slot: {
      type: Schema.Types.ObjectId,
      ref: 'BookingSlots',
      required: true,
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
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

export const Booking = model<TBookings, TBookingsModules>(
  'Booking',
  bookingsSchema,
)
