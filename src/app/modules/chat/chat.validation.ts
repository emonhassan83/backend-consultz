import { z } from 'zod'

const createValidation = z.object({
  body: z.object({
    participants: z
      .array(z.string())
      .length(2, 'must be add in the array user and receiver id'),
  }),
})

const updateValidation = z.object({
  body: z.object({
    name: z.string({
      required_error: 'Chat name is required!',
    }),
    status: z.enum(['accepted', 'blocked']).optional(),
  }),
})

export const ChatValidation = {
  createValidation,
  updateValidation,
}
