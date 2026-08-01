import { z } from 'zod'
import { SESSION_TYPE } from './booking.constants'

const createValidationSchema = z.object({
  body: z
    .object({
      consult: z.string().min(1, { message: 'Consultant ID is required' }),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Date must be in YYYY-MM-DD format',
      }),
      startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
        message: 'Start time must be in HH:mm format',
      }),
      localDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: 'Local date must be in YYYY-MM-DD format',
        })
        .optional(),
      localStartTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
          message: 'Local start time must be in HH:mm format',
        })
        .optional(),
      sessionType: z.enum(Object.values(SESSION_TYPE) as [string, ...string[]], {
        message: 'Session type is required',
      }),
      sessionDuration: z
        .number()
        .positive({ message: 'Session duration must be greater than 0' }),
      mainQuestion: z.string().min(1, { message: 'Main question is required' }),
      challengeQuestion: z
        .string()
        .min(1, { message: 'Challenge question is required' }),
      backgroundQuestion: z
        .string()
        .min(1, { message: 'Background question is required' }),
    })
    .superRefine((data, ctx) => {
      if (data.localDate && !data.localStartTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Local start time is required when local date is provided',
          path: ['localStartTime'],
        })
      }

      if (data.localStartTime && !data.localDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Local date is required when local start time is provided',
          path: ['localDate'],
        })
      }
    }),
})

const rescheduleValidationSchema = z.object({
  body: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Date must be in YYYY-MM-DD format',
      }),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
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
