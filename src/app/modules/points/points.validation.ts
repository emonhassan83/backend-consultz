import { z } from 'zod'
import { POINTS_AUDIENCE } from './points.constant'

const conditionsSchema = z
  .object({
    minSessions: z.number().int().min(0).optional(),
    minReviews: z.number().int().min(0).optional(),
    windowDays: z.number().int().min(1).optional(),
    responsePct: z.number().min(0).max(100).optional(),
    responseMinutes: z.number().int().min(1).optional(),
    minRequests: z.number().int().min(0).optional(),
    deferUntil: z.string().trim().optional(),
    onlyDuringAvailability: z.boolean().optional(),
    minAvgRating: z.number().min(0).max(5).optional(),
  })
  .passthrough()

const updateRuleSchema = z.object({
  body: z
    .object({
      key: z.string().trim().min(1).optional(),
      points: z.number().min(0).optional(),
      audience: z
        .enum(Object.values(POINTS_AUDIENCE) as [string, ...string[]])
        .optional(),
      conditions: conditionsSchema.optional(),
    })
    .refine(
      (data) =>
        data.key !== undefined ||
        data.points !== undefined ||
        data.audience !== undefined ||
        data.conditions !== undefined,
      { message: 'At least one field is required' },
    ),
})

const toggleEnabledSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
  }),
})

const attributionSchema = z.object({
  body: z.object({
    expertRef: z.string().trim().min(1, 'expertRef is required'),
  }),
})

export const PointsValidation = {
  updateRuleSchema,
  toggleEnabledSchema,
  attributionSchema,
}
