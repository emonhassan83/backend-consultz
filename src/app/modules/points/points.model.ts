import { Schema, model } from 'mongoose'
import { POINTS_AUDIENCE } from './points.constant'
import { TPointsRule, TPointsRuleModel } from './points.interface'

const pointsRuleSchema = new Schema<TPointsRule>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    points: { type: Number, required: true, min: 0 },
    enabled: { type: Boolean, default: true },
    audience: {
      type: String,
      enum: Object.values(POINTS_AUDIENCE),
      required: true,
    },
    conditions: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
)

pointsRuleSchema.index({ key: 1 }, { unique: true })

export const PointsRule = model<TPointsRule, TPointsRuleModel>(
  'PointsRule',
  pointsRuleSchema,
)
