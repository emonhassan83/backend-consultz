import { Schema, model } from 'mongoose'
import { TFeed, TFeedModel } from './feed.interface'
import { FEED_STATUS } from './feed.constant'

const feedSchema = new Schema<TFeed>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: [String],
      required: false,
      default: [],
    },
    description: {
      type: String,
      required: false,
      default: null,
    },
    contentMeta: {
      type: Schema.Types.ObjectId,
      ref: 'ContentMeta',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(FEED_STATUS),
      default: FEED_STATUS.active,
    },
    moderationActions: {
      type: [
        {
          action: { type: String, required: true },
          reason: { type: String, required: true },
          admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

export const Feed = model<TFeed, TFeedModel>('Feed', feedSchema)
