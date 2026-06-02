import mongoose from 'mongoose'
import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    content: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid content ID',
    }),
    comment: z.string().min(1, 'Comment cannot be empty')
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    comment: z.string().min(1, 'Comment cannot be empty').optional(),
  }),
})

export const CommentValidation = {
  createValidationSchema,
  updateValidationSchema,
}
