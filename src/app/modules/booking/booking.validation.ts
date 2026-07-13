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
      message: 'Session type is required',
    }),
    sessionDuration: z
      .number()
      .positive({ message: 'Session duration must be greater than 0' }),
    price: z
      .number()
      .nonnegative({ message: 'Price must be zero or a positive number' }),
    timezone: z.string().min(1, { message: 'Timezone is required' }).optional(),
    localDate: z.string().min(1, { message: 'Local date is required' }).optional(),
    localTime: z.string().min(1, { message: 'Local time is required' }).optional(),
    mainQuestion: z.string().min(1, { message: 'Main question is required' }),
    challengeQuestion: z
      .string()
      .min(1, { message: 'Challenge question is required' }),
    backgroundQuestion: z
      .string()
      .min(1, { message: 'Background question is required' }),
  }),
})

const rescheduleValidationSchema = z.object({
  body: z.object({
    slot: objectIdSchema,
    localDate: z.string({ message: 'Local date required' }),
    localTime: z.string({ message: 'Local time required' }),
  }),
})

const completedValidationSchema = z.object({
  body: z.object({
    recordDuration: z.number({
      message: 'Record duration is required!',
    }),
    recordFile: z.string({
      message: 'Record file is required!',
    }),
  }),
})

const declineValidationSchema = z.object({
  body: z.object({
    reason: z.string({
      message: 'Reason is required!',
    }),
  }),
})

export const BookingsValidation = {
  createValidationSchema,
  rescheduleValidationSchema,
  completedValidationSchema,
  declineValidationSchema,
}
