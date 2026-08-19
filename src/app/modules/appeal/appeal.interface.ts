import { Model, Types } from 'mongoose'
import { TAppealStatus } from './appeal.constant'

export type TAppeal = {
  _id?: Types.ObjectId
  feed: Types.ObjectId
  user: Types.ObjectId
  reason: string
  files?: string[]
  status: TAppealStatus
  createdAt?: Date
  updatedAt?: Date
}

export type TAppealModel = Model<TAppeal, Record<string, unknown>>
