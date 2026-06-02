import { Model, Types } from 'mongoose'

export type TContentMeta = {
  _id?: string
  content?: Types.ObjectId
  like?: number
  likeBy?: string[]
  comment?: number
}

export type TContentMetaModel = Model<TContentMeta, Record<string, unknown>>
