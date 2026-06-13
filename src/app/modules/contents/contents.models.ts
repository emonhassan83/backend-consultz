import { Schema, model } from 'mongoose'
import { TContents, TContentsModel } from './contents.interface'

const contentsSchema = new Schema<TContents>(
  {
    termsAndConditions: {
      type: String,
    },
    paymentHoldDays: {
      type: Number,
      min: 1,
      max: 60
    },
    consultationFee: {
      type: Number,
      min: 0,
      max: 40
    },
    supportEmail: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

// filter out deleted documents

export const Contents = model<TContents, TContentsModel>(
  'Contents',
  contentsSchema,
)
