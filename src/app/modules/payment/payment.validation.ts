import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    account: z.string({ required_error: 'User ID is required!' }),
    reference: z.string({ required_error: 'Reference ID is required!' }),
  }),
})

const paymentLinkValidationSchema = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' }),
  }),
})

export const PaymentValidation = {
  createValidationSchema,
  paymentLinkValidationSchema,
}
