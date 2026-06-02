import mongoose from 'mongoose'
import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    user: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid user ID',
    }),
    comment: z.string().min(1, 'Comment cannot be empty'),
    replyRef: z
      .string()
      .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: 'Invalid user ID',
      })
      .optional(),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    comment: z.string().min(1, 'Comment cannot be empty').optional(),
  }),
})

export const ReplyValidation = {
  createValidationSchema,
  updateValidationSchema,
}
