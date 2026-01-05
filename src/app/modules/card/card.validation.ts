import mongoose from 'mongoose'
import { z } from 'zod'

/* ============================
   Create Card Validation
============================ */
const createValidationSchema = z.object({
  body: z.object({
    holderName: z.string({
      required_error: 'Card holder name is required',
    }).min(1, 'Card holder name cannot be empty'),

    cardNumber: z.string({
      required_error: 'Card number is required',
    }).min(12, 'Card number must be valid'),

    expiryDate: z.string({
      required_error: 'Expiry date is required',
    }).min(1, 'Expiry date cannot be empty'),

    cvc: z.string({
      required_error: 'CVC is required',
    }).min(3, 'CVC must be valid')
  }),
})

/* ============================
   Update Card Validation
============================ */
const updateValidationSchema = z.object({
  body: z.object({
    holderName: z.string().min(1).optional(),
    cardNumber: z.string().min(12).optional(),
    expiryDate: z.string().min(1).optional(),
    cvc: z.string().min(3).optional()
  }),
})

export const CardValidation = {
  createValidationSchema,
  updateValidationSchema,
}
