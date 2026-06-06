import mongoose from 'mongoose'
import { z } from 'zod'

/* ============================
   Create Card Validation
============================ */
const createValidationSchema = z.object({
  body: z.object({
    holderName: z.string({
      message: 'Card holder name is required',
    }).min(1, { message: 'Card holder name cannot be empty' }),

    cardNumber: z.string({
      message: 'Card number is required',
    }).min(12, { message: 'Card number must be valid' }),

    expiryDate: z.string({
      message: 'Expiry date is required',
    }).min(1, { message: 'Expiry date cannot be empty' }),

    cvc: z.string({
      message: 'CVC is required',
    }).min(3, { message: 'CVC must be valid' })
  }),
})

export const CardValidation = {
  createValidationSchema
}
