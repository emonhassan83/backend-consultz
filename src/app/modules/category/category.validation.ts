import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    title: z.string({
        required_error: "Category title is required"
    })
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    title: z.string({
        required_error: "Category title is required"
    }).optional()
  }),
})

export const CategoryValidation = {
  createValidationSchema,
  updateValidationSchema,
}
