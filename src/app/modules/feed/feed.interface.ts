import { Model, Types } from 'mongoose'
import { TFeedStatus } from './feed.constant'

export type TFeed = {
  _id?: string
  author: Types.ObjectId
  content: string[]
  description: string
  contentMeta: Types.ObjectId | string
  status: TFeedStatus
  isDeleted?: boolean
}

export type TFeedModel = Model<TFeed, Record<string, unknown>>
