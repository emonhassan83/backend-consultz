import { z } from 'zod'
import { Types } from 'mongoose'
import { SESSION_TYPE } from './booking.constants'

// reusable ObjectId validator
const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId format',
})

const createValidationSchema = z.object({
  body: z.object({
    consult: objectIdSchema,
    slot: objectIdSchema,
    sessionType: z.enum(Object.values(SESSION_TYPE) as [string, ...string[]], {
      required_error: 'Session type is required',
    }),
    sessionDuration: z
      .number()
      .positive('Session duration must be greater than 0'),
    price: z.number().nonnegative('Price must be zero or a positive number'),
    timezone: z.string().min(1, 'Timezone is required').optional(),
    mainQuestion: z.string().min(1, 'Main question is required'),
    challengeQuestion: z.string().min(1, 'Challenge question is required'),
    backgroundQuestion: z.string().min(1, 'Background question is required'),
  }),
})

const rescheduleValidationSchema = z.object({
  body: z.object({
    slot: objectIdSchema,
  }),
})

export const BookingsValidation = {
  createValidationSchema,
  rescheduleValidationSchema,
}
