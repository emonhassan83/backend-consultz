import { Schema, model } from 'mongoose'
import { TContents, TContentsModel } from './contents.interface'

const contentsSchema = new Schema<TContents>(
  {
    aboutUs: {
      type: String,
    },
    termsAndConditions: {
      type: String,
    },
    privacyPolicy: {
      type: String,
    },
    supports: {
      type: String,
    },
    faq: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
