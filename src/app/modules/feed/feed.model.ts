import { Schema, model } from 'mongoose'
import { TFeed, TFeedModel } from './feed.interface'

const feedSchema = new Schema<TFeed>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: [String],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    contentMeta: {
      type: Schema.Types.ObjectId,
      ref: 'ContentMeta',
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

export const Feed = model<TFeed, TFeedModel>('Feed', feedSchema)
