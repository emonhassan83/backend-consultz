import { z } from 'zod'
import { SESSION_TYPE } from './booking.constants'

const objectIdSchema = z.string().min(1, { message: 'Slot ID is required' })

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
  body: z
    .object({
      slot: objectIdSchema.optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: 'Date must be in YYYY-MM-DD format',
        })
        .optional(),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
          message: 'Start time must be in HH:mm format',
        })
        .optional(),
    })
    .superRefine((data, ctx) => {
      const hasDynamicPayload = !!data.date && !!data.startTime
      const hasOldSlotPayload = !!data.slot

      if (!hasDynamicPayload && !hasOldSlotPayload) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Either date/startTime or slot is required',
          path: ['date'],
        })
      }

      if (data.date && !data.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Start time is required when date is provided',
          path: ['startTime'],
        })
      }

      if (data.startTime && !data.date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date is required when start time is provided',
          path: ['date'],
        })
      }
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
