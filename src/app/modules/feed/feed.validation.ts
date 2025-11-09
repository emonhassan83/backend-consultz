import mongoose from 'mongoose'
import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    author: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid author ID',
    }),
    description: z.string().min(1, 'Description is required')
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    description: z.string().min(1, 'Description is required').optional()
  }),
})

export const FeedValidation = {
  createValidationSchema,
  updateValidationSchema
}
