import { z } from 'zod'

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, {
  message: 'Invalid user ID',
})

const createLogSchema = z.object({
  body: z.object({
    user: objectIdSchema,
    type: z.enum(['credit', 'debit']),
    points: z.number().positive(),
    reason: z.string().trim().min(1, 'Reason is required'),
    source: z.enum(['manual_adjustment', 'reword']),
  }),
})

export const PointsLogsValidation = {
  createLogSchema,
}
