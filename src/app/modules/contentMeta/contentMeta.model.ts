import { Schema, model } from 'mongoose'
import { TContentMeta, TContentMetaModel } from './contentMeta.interface'

const contentMetaSchema = new Schema<TContentMeta>(
  {
    content: {
      type: Schema.Types.ObjectId,
      ref: 'Feed',
    },
    like: { type: Number, default: 0 },
    likeBy: { type: [String], ref: 'User', default: [] },
    comment: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
)

export const ContentMeta = model<TContentMeta, TContentMetaModel>(
  'ContentMeta',
  contentMetaSchema,
)
