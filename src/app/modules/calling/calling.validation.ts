import { Types } from 'mongoose'
import { z } from 'zod'

// reusable ObjectId validator
const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId format',
})

const startCallingValidation = z.object({
  body: z.object({
    bookingId: objectIdSchema,
    isVideo: z.boolean({
      message: 'Call type (video/audio) is required',
    }),
  }),
})

const endCallingValidation = z.object({
  body: z.object({
    callId: objectIdSchema
  }),
})

const callTokenZod = z.object({
  body: z.object({
    callId: objectIdSchema
  }),
})

export const CallingValidation = {
  startCallingValidation,
  endCallingValidation,
  callTokenZod
}
