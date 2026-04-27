import { Schema, model } from 'mongoose'
import { TBookingSlots, TBookingSlotsModel } from './bookingSlots.interface'

const bookingSlotsSchema = new Schema<TBookingSlots>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    isBooked: { type: Boolean, default: false },
  }
)

// Composite unique index (duplicate prevent করবে)
bookingSlotsSchema.index({ author: 1, date: 1, time: 1 }, { unique: true });

// Query optimization
bookingSlotsSchema.index({ author: 1, date: 1 });
bookingSlotsSchema.index({ author: 1, isBooked: 1 });

export const BookingSlots = model<TBookingSlots, TBookingSlotsModel>(
  'BookingSlots',
  bookingSlotsSchema,
)
