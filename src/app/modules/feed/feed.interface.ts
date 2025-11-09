import { Model, Types } from 'mongoose'

export type TFeed = {
  _id?: string
  author: Types.ObjectId
  content: string[]
  description: string
  contentMeta: Types.ObjectId | string
  isDeleted?: boolean
}

export type TFeedModel = Model<TFeed, Record<string, unknown>>
