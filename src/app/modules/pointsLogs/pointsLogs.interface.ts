import { Model, Types } from 'mongoose'
import { TPointsLogSource, TPointsLogType } from './pointsLogs.constant'

export type TPointsLogMeta = {
  bookingId?: Types.ObjectId | string
  referredUserId?: Types.ObjectId | string
  expertId?: Types.ObjectId | string
  windowStart?: Date
  windowEnd?: Date
  [key: string]: unknown
}

export type TPointsLog = {
  _id?: string
  user: Types.ObjectId
  type: TPointsLogType
  points: number
  reason: string
  source: TPointsLogSource
  rewardKey?: string
  meta?: TPointsLogMeta
  createdAt?: Date
  updatedAt?: Date
}

export type TPointsLogModel = Model<TPointsLog, Record<string, unknown>>
