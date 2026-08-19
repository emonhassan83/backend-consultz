import { Model, Types } from 'mongoose'
import { TPointsLogSource, TPointsLogType } from './pointsLogs.constant'

export type TPointsLog = {
  _id?: string
  user: Types.ObjectId
  type: TPointsLogType
  points: number
  reason: string
  source: TPointsLogSource
  createdAt?: Date
  updatedAt?: Date
}

export type TPointsLogModel = Model<TPointsLog, Record<string, unknown>>
