import { Model, Types } from 'mongoose'
import {
  TPointsAudience,
  TPointsRewardKey,
  TPointsRuleConditions,
} from './points.constant'

export type TPointsRule = {
  _id?: Types.ObjectId
  key: TPointsRewardKey | string
  points: number
  enabled: boolean
  audience: TPointsAudience
  conditions: TPointsRuleConditions
  createdAt?: Date
  updatedAt?: Date
}

export type TPointsAwardMeta = {
  bookingId?: Types.ObjectId | string
  referredUserId?: Types.ObjectId | string
  expertId?: Types.ObjectId | string
  windowStart?: Date
  windowEnd?: Date
  [key: string]: unknown
}

export type TAwardByKeyPayload = {
  userId: Types.ObjectId | string
  key: TPointsRewardKey | string
  reason?: string
  meta?: TPointsAwardMeta
  session?: any
  skipPush?: boolean
}

export type TPointsRuleModel = Model<TPointsRule, Record<string, unknown>>
