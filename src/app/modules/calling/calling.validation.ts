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
      required_error: 'Call type (video/audio) is required',
    }),
  }),
})

export const CallingValidation = {
  startCallingValidation,
}
