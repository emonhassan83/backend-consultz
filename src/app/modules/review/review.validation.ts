import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    booking: z.string({
      required_error: 'Reviews bookingID is Required',
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
