import mongoose from 'mongoose'
import { z } from 'zod'
import { CONTENT_META_MODEL_TYPE } from './contentMeta.interface'

const createValidationSchema = z.object({
  body: z.object({
    content: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid content ID',
    }).optional(),
   modelType: z.enum(
         Object.values(CONTENT_META_MODEL_TYPE) as [string, ...string[]],
       ).optional(),
    like: z.number().int().min(0).default(0),
    comment: z.number().int().min(0).default(0),
    view: z.number().int().min(0).default(0)
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
