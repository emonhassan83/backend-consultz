import { z } from 'zod'
import { Types } from 'mongoose'

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

export const AppealValidation = {
  createAppealValidationSchema,
}
