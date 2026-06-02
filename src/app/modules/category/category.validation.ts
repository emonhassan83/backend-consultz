import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    title: z.string({
      required_error: 'Category title is required',
    }),
    items: z
      .array(z.string().min(1, 'Item cannot be empty'))
      .optional()
      .default([]),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Category title is required',
      })
      .optional(),
    items: z
      .array(z.string().min(1, 'Item cannot be empty'))
      .optional()
      .default([]),
  }),
})

export const CategoryValidation = {
  createValidationSchema,
  updateValidationSchema,
}
