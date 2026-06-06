import mongoose from 'mongoose'
import { z } from 'zod'
import { REPORT_STATUS } from './report.constant'

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

const updateValidationSchema = z.object({
  body: z.object({
    reason: z
      .string({
        message: 'Report reason is required !',
      })
      .optional(),
  }),
})

const changeStatusValidationSchema = z.object({
  body: z.object({
    status: z.enum(Object.values(REPORT_STATUS) as [string, ...string[]], {
      message: 'Report status is required!',
    }),
  }),
})

export const ReportValidation = {
  createValidationSchema,
  updateValidationSchema,
  changeStatusValidationSchema,
}
