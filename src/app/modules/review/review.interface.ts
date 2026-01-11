import { Model, Types } from 'mongoose'

export interface TReviews {
  _id?: Types.ObjectId
  user: Types.ObjectId
  expert: Types.ObjectId
  booking: Types.ObjectId
  review: string
  rating: number
}

export type TReviewsModules = Model<TReviews, Record<string, unknown>>
