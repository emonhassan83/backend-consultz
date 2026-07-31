import { z } from 'zod'

const dynamicSlotsValidationSchema = z.object({
  query: z.object({
    expertId: z.string({ message: 'Expert ID is required' }).min(1),
    date: z
      .string({ message: 'Date is required' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Date must be in YYYY-MM-DD format',
      }),
    duration: z.coerce
      .number({ message: 'Duration is required' })
      .positive({ message: 'Duration must be greater than 0' }),
  }),
})

export const BookingSlotsValidation = {
  dynamicSlotsValidationSchema,
}
