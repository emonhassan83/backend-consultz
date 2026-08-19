import { Schema, model } from 'mongoose'
import { TAppeal, TAppealModel } from './appeal.interface'
import { APPEAL_STATUS } from './appeal.constant'

const appealSchema = new Schema<TAppeal>(
  {
    report: { type: Schema.Types.ObjectId, ref: 'Report', required: true },
    feed: { type: Schema.Types.ObjectId, ref: 'Feed', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true },
    files: { type: [String], default: [] },
    status: {
      type: String,
      enum: Object.values(APPEAL_STATUS),
      default: APPEAL_STATUS.pending,
    },
  },
  { timestamps: true },
)

export const Appeal = model<TAppeal, TAppealModel>('Appeal', appealSchema)
