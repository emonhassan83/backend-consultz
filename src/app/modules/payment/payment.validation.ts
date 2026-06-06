import { Types } from 'mongoose'
import { z } from 'zod'

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
})

const createValidationSchema = z.object({
  body: z.object({
    account: objectIdSchema,
    booking: objectIdSchema,
  }),
})

const confirmPaymentSchema = z.object({
  body: z.object({
    user: objectIdSchema,
    booking: objectIdSchema,
    paymentIntentId: z.string({
      message: 'Payment IntentId is required!',
    }),
  }),
})

export const PaymentValidation = {
  createValidationSchema,
  confirmPaymentSchema,
}
