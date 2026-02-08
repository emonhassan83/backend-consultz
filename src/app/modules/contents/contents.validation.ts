import { z } from 'zod'

const updateValidationSchema = z.object({
  body: z.object({
    termsAndConditions: z
      .string({ required_error: 'terms and conditions us is required' })
      .optional(),
    paymentHoldDays: z.number({ required_error: 'paymentHoldDays is required' }).optional(),
    consultationFee: z.number({ required_error: 'consultationFee is required' }).optional(),
  }),
})

export const contentsValidation = {
  updateValidationSchema
}
