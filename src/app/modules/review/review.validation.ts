import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    reference: z.string({
      required_error: 'Reviews reference is Required',
    }),
    review: z.string({
      required_error: 'Reviews description is Required',
    }),
    rating: z
      .number({
        required_error: 'Reviews rating is Required',
      })
      .min(1)
      .max(5),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    review: z
      .string({
        required_error: 'Reviews description is Required',
      })
      .optional(),
    rating: z
      .number({
        required_error: 'Reviews rating is Required',
      })
      .min(1)
      .max(5)
      .optional(),
  }),
})

export const ReviewsValidation = {
  createValidationSchema,
  updateValidationSchema,
}
