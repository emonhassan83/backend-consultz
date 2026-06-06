import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    booking: z.string({
      message: 'Reviews bookingID is Required',
    }),
    review: z.string({
      message: 'Reviews description is Required',
    }),
    rating: z
      .number({
        message: 'Reviews rating is Required',
      })
      .min(1)
      .max(5),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    review: z
      .string({
        message: 'Reviews description is Required',
      })
      .optional(),
    rating: z
      .number({
        message: 'Reviews rating is Required',
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
