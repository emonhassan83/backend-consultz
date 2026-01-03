import { model, Schema } from 'mongoose'
import { TBookings, TBookingsModules } from './booking.interface'
import { BOOKING_STATUS, PAYMENT_STATUS } from './booking.constants'

const bookingsSchema = new Schema<TBookings>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    session: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    slot: {
      type: Schema.Types.ObjectId,
      ref: 'SessionSlots',
      required: true,
    },
    credit: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.paid,
    },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.pending,
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
