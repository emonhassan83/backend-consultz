import { Schema, model } from 'mongoose'
import { TPointsLog, TPointsLogModel } from './pointsLogs.interface'
import { POINTS_LOG_SOURCE, POINTS_LOG_TYPE } from './pointsLogs.constant'

const pointsLogSchema = new Schema<TPointsLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: Object.values(POINTS_LOG_TYPE),
      required: true,
    },
    points: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: Object.values(POINTS_LOG_SOURCE),
      required: true,
    },
  },
  { timestamps: true },
)

export const PointsLog = model<TPointsLog, TPointsLogModel>(
  'PointsLog',
  pointsLogSchema,
)
