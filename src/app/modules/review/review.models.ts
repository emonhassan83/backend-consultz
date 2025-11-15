import { model, Schema } from 'mongoose'
import {
  TReviews,
  TReviewsModules,
} from './review.interface'

const reviewsSchema = new Schema<TReviews>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reference: {
      type: Schema.Types.ObjectId,
      refPath: 'User',
      required: true,
    },
    review: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  },
)

export const Reviews = model<TReviews, TReviewsModules>('Review', reviewsSchema)
