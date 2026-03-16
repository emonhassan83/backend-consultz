import { Types } from 'mongoose'
import { z } from 'zod'

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId format',
})

const createValidationSchema = z.object({
  body: z.object({
    receiver: objectIdSchema,
    message: z.string({
      required_error: 'Message is required',
    }),
    description: z.string({
      invalid_type_error: 'Description must be a string',
    }),
    reference: objectIdSchema.optional(),
    model_type: z.string({
      required_error: 'Model type is required',
    }),
  }),
})

export const NotificationValidation = {
  createValidationSchema,
}
