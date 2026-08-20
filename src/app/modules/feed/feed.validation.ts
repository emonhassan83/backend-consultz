import { z } from 'zod'
import { FEED_MODERATION_ACTION } from './feed.constant'

const createValidationSchema = z.object({
  body: z.object({
    description: z.string().min(1, 'Description is required').optional(),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    description: z.string().min(1, 'Description is required').optional()
  }),
})

const changeStatusValidationSchema = z.object({
  body: z.object({
    status: z.enum(['active', 'restrict'], {
      message: 'Status must be either active or inactive',
    }),
  }),
})

const moderationActionValidationSchema = z.object({
  body: z.object({
    moderationStatus: z.enum(
      Object.values(FEED_MODERATION_ACTION) as [string, ...string[]],
      {
        message: 'Invalid moderation status',
      },
    ),
    reason: z
      .string({ message: 'Reason is required' })
      .trim()
      .min(1, { message: 'Reason is required' }),
  }),
})

export const FeedValidation = {
  createValidationSchema,
  updateValidationSchema,
  changeStatusValidationSchema,
  moderationActionValidationSchema,
}
