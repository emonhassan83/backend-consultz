import { z } from 'zod'
import { SESSION_TYPE } from './booking.constants'

const createValidationSchema = z.object({
  body: z.object({
    consult: z.string().min(1, { message: 'Consultant ID is required' }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Date must be in YYYY-MM-DD format',
    }),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
      message: 'Start time must be in HH:mm format',
    }),
    sessionType: z.enum(Object.values(SESSION_TYPE) as [string, ...string[]], {
      message: 'Session type is required',
    }),
    sessionDuration: z
      .number()
      .positive({ message: 'Session duration must be greater than 0' }),
    price: z
      .number()
      .nonnegative({ message: 'Price must be zero or a positive number' }),
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
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Date must be in YYYY-MM-DD format',
    }),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
      message: 'Start time must be in HH:mm format',
    }),
  }),
})

const requestScheduleChangeValidationSchema = z.object({
  body: z.object({
    reason: z.string().trim().max(500).optional(),
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
  requestScheduleChangeValidationSchema,
  completedValidationSchema,
  declineValidationSchema,
}
