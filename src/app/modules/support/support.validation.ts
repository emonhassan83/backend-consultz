import { z } from 'zod'
import { SUPPORT_STATUS } from './support.constant'

const createValidationSchema = z.object({
  body: z.object({
    author: z.string({ required_error: 'Author ID is required' }),
    email: z.string({
      required_error: 'Support Email is Required!',
    }),
    subject: z.string().min(3, 'subject must be at least 3 characters'),
    messages: z.string({ required_error: 'Support messages is required' }),
  }),
})

const sentMessageValidationSchema = z.object({
  body: z.object({
    subject: z.string().min(3, 'subject must be at least 3 characters'),
    messages: z.string({ required_error: 'Support messages is required' }),
  }),
})

const changeStatusValidationSchema = z.object({
  body: z.object({
    status: z.enum(Object.values(SUPPORT_STATUS) as [string, ...string[]]),
  }),
})

export const SupportValidation = {
  createValidationSchema,
  sentMessageValidationSchema,
  changeStatusValidationSchema,
}
