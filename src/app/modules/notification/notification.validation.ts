import { Types } from 'mongoose'
import { z } from 'zod'

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId format',
})

const createValidationSchema = z.object({
  body: z.object({
    receiver: objectIdSchema,
    message: z.string({
      message: 'Message is required',
    }),
    description: z.string({
      message: 'Description must be a string',
    }),
    reference: objectIdSchema.optional(),
    modelType: z.string({
      message: 'Model type is required',
    }),
  }),
})

export const NotificationValidation = {
  createValidationSchema,
}
