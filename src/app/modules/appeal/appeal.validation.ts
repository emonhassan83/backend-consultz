import { z } from 'zod'
import { Types } from 'mongoose'
import { APPEAL_STATUS } from './appeal.constant'

const objectIdSchema = z.string().refine((value) => Types.ObjectId.isValid(value), {
  message: 'Invalid ObjectId',
})

const createAppealValidationSchema = z.object({
  body: z.object({
    feed: objectIdSchema,
    reason: z.string({ message: 'Appeal reason is required!' }).trim().min(1, {
      message: 'Appeal reason is required!',
    }),
    files: z
      .array(z.string().url({ message: 'Each file must be a valid URL' }))
      .optional(),
  }),
})

const decisionAppealValidationSchema = z.object({
  body: z.object({
    status: z.enum([APPEAL_STATUS.approved, APPEAL_STATUS.rejected], {
      message: 'Appeal status must be approved or rejected',
    }),
    note: z
      .string({ message: 'Note must be a string' })
      .trim()
      .min(1, { message: 'Note cannot be empty' })
      .optional(),
  }),
})

export const AppealValidation = {
  createAppealValidationSchema,
  decisionAppealValidationSchema,
}
