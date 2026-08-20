import { Schema, model } from 'mongoose'
import { TFeed, TFeedModel } from './feed.interface'
import { FEED_MODERATION_ACTION, FEED_STATUS } from './feed.constant'

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
    moderationStatus: {
      type: String,
      enum: Object.values(FEED_MODERATION_ACTION),
      default: null,
    },
    reason: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

export const Feed = model<TFeed, TFeedModel>('Feed', feedSchema)
