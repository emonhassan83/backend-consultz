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

const refundValidationSchema = z.object({
  body: z.object({
    type: z.enum(['full', 'partial']),
    amount: z.number().positive().optional(),
    reason: z.string().trim().min(1, 'Refund reason is required'),
  }).superRefine((data, ctx) => {
    if (data.type === 'partial' && !data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Refund amount is required for partial refund',
      })
    }

    if (data.type === 'full' && data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Amount is not allowed for full refund',
      })
    }
  }),
})

export const PaymentValidation = {
  createValidationSchema,
  confirmPaymentSchema,
  refundValidationSchema,
}
