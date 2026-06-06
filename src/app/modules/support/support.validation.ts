import { z } from 'zod'
import { SUPPORT_STATUS } from './support.constant'

const createValidationSchema = z.object({
  body: z.object({
    subject: z
      .string()
      .min(3, { message: 'subject must be at least 3 characters' }),
    messages: z.string({ message: 'Support messages is required' }),
  }),
})

const sentMessageValidationSchema = z.object({
  body: z.object({
    subject: z
      .string()
      .min(3, { message: 'subject must be at least 3 characters' }),
    messages: z.string({ message: 'Support messages is required' }),
  }),
})

export const SupportValidation = {
  createValidationSchema,
  sentMessageValidationSchema,
}
