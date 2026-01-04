import { Schema, model } from 'mongoose'
import { TBookingSlots, TBookingSlotsModel } from './bookingSlots.interface'

const bookingSlotsSchema = new Schema<TBookingSlots>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
  }
)

export const BookingSlots = model<TBookingSlots, TBookingSlotsModel>(
  'BookingSlots',
  bookingSlotsSchema,
)
