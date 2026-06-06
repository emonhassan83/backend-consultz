import { Types } from 'mongoose'
import { z } from 'zod'

// reusable ObjectId validator
const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId format',
})

const createSubCategoryValidation = z.object({
  body: z.object({
    category: objectIdSchema,
    title: z
      .string({
        message: 'Subcategory title is required',
      })
      .min(2, { message: 'Title must be at least 2 characters' }),
    items: z
      .array(z.string().min(1, { message: 'Item cannot be empty' }))
      .optional()
      .default([]),
  }),
})

const updateSubCategoryValidation = z.object({
  body: z.object({
    title: z
      .string()
      .min(2, { message: 'Title must be at least 2 characters' })
      .optional(),
    items: z
      .array(z.string().min(1, { message: 'Item cannot be empty' }))
      .optional(),
  }),
})

export const SubCategoryValidation = {
  createSubCategoryValidation,
  updateSubCategoryValidation,
}
