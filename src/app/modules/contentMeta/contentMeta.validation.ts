import mongoose from 'mongoose'
import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    content: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid content ID',
    }).optional()
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    like: z.number().int().min(0).default(0).optional(),
    comment: z.number().int().min(0).default(0).optional(),
    view: z.number().int().min(0).default(0).optional()
  }),
})

export const ContentMetaValidation = {
  createValidationSchema,
  updateValidationSchema,
}
