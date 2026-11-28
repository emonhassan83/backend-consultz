import { z } from 'zod'
import { getPhoneError } from './normalizePhone'

// Shared phone field for request validation (#12). Length is checked on the
// digits, not the raw text, so spaces and dashes don't fail validation.
export const phoneNumberSchema = (requiredMessage = 'Phone number is required') =>
  z
    .string({ message: requiredMessage })
    .trim()
    .superRefine((value, ctx) => {
      const error = getPhoneError(value)
      if (error) ctx.addIssue({ code: 'custom', message: error })
    })
