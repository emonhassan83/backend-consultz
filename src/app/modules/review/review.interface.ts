import { Model, Types } from 'mongoose'

export interface TReviews {
  _id?: Types.ObjectId
  user: Types.ObjectId
  reference: Types.ObjectId
  review: string
  rating: number
}

export type TReviewsModules = Model<TReviews, Record<string, unknown>>
