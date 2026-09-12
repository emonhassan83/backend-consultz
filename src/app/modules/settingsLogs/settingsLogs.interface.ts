import { Model, Types } from 'mongoose'

export interface TSettingsLog {
  key: string
  previousValue: any
  newValue: any
  changedBy: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

export type TSettingsLogModel = Model<TSettingsLog, Record<string, unknown>>
