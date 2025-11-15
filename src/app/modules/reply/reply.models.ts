import { model, Schema, Types } from 'mongoose'
import { TReply, TReplyModules } from './reply.interface'

const replySchema = new Schema<TReply>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    replyRef: {
      type: Types.ObjectId,
      ref: 'Comments',
    },
    comment: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

export const Reply = model<TReply, TReplyModules>('Reply', replySchema)
