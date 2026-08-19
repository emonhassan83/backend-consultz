import mongoose from 'mongoose'
import { z } from 'zod'

// Define the Zod validation schema
const createValidationSchema = z.object({
  body: z.object({
    feed: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid feed ID',
    }),
    reason: z.string({
      message: 'Report reason is required !',
    }),
  }),
})

export const ReportValidation = {
  createValidationSchema,
}
