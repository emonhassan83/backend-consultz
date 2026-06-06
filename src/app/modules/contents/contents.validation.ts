import { z } from 'zod'

const updateValidationSchema = z.object({
  body: z.object({
    termsAndConditions: z
      .string({
        message: 'Terms and conditions are required',
      })
      .optional(),

    paymentHoldDays: z
      .number({
        message: 'paymentHoldDays is required'
      })
      .min(1, { message: 'paymentHoldDays must be at least 1' })
      .max(60, { message: 'paymentHoldDays cannot exceed 60' })
      .optional(),

    consultationFee: z
      .number({
        message: 'consultationFee is required'
      })
      .min(0, { message: 'consultationFee cannot be negative' })
      .max(40, { message: 'consultationFee cannot exceed 40' })
      .optional(),
  })
    // Optional: Add .strict() if you want to reject unknown fields
    .strict(),
});

export const contentsValidation = {
  updateValidationSchema
}
