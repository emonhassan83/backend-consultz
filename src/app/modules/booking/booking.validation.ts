import { z } from 'zod'
import { Types } from 'mongoose'
import { BOOKING_STATUS, PAYMENT_STATUS } from './booking.constants'

const createValidationSchema = z.object({
  body: z.object({
    user: z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid user ID format',
    }),
    session: z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid session ID format',
    }),
    slot: z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid slot ID format',
    }),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    paymentStatus: z
      .enum(Object.values(PAYMENT_STATUS) as [string, ...string[]])
      .optional(),
    status: z
      .enum(Object.values(BOOKING_STATUS) as [string, ...string[]])
      .optional(),
  }),
})

export const BookingsValidation = {
  createValidationSchema,
  updateValidationSchema,
}
