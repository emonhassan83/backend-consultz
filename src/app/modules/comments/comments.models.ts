import { model, Schema, Types } from 'mongoose'
import {
  TComments,
  TCommentsModules,
} from './comments.interface'

const commentsSchema = new Schema<TComments>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: Schema.Types.ObjectId,
      refPath: 'Feed',
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
    reply: [
      {
        type: Types.ObjectId,
        ref: 'Reply',
      },
    ],
  },
  {
    timestamps: true,
  },
)

export const Comments = model<TComments, TCommentsModules>(
  'Comments',
  commentsSchema,
)
