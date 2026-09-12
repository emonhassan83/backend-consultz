import { model, Schema } from 'mongoose'
import { TSettingsLog, TSettingsLogModel } from './settingsLogs.interface'

const settingsLogSchema = new Schema<TSettingsLog>(
  {
    key: { type: String, required: true, trim: true },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

export const SettingsLog = model<TSettingsLog, TSettingsLogModel>(
  'SettingsLog',
  settingsLogSchema,
)
