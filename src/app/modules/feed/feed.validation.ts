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

const changeStatusValidationSchema = z.object({
  body: z.object({
    status: z.enum(['active', 'inactive'], {
      message: 'Status must be either active or inactive',
    }),
  }),
})

export const FeedValidation = {
  createValidationSchema,
  updateValidationSchema,
  changeStatusValidationSchema
}
