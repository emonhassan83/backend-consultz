import { Schema, model } from 'mongoose'
import { TSupport, TSupportModel } from './support.interface'
import { AUDIENCE, SUPPORT_STATUS } from './support.constant'

const supportSchema = new Schema<TSupport>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    audience: {
      type: String,
      enum: Object.values(AUDIENCE),
      required: true,
    },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    messages: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(SUPPORT_STATUS),
      default: SUPPORT_STATUS.pending,
    },
  },
  {
    timestamps: true,
  },
)

export const Support = model<TSupport, TSupportModel>('Support', supportSchema)
