import { Schema, Types, model } from 'mongoose'
import { modeType, TNotification } from './notification.interface'

const notificationSchema = new Schema<TNotification>(
  {
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reference: {
      type: Schema.Types.ObjectId,
      refPath: 'modelType',
    },
    modelType: {
      type: String,
      enum: Object.values(modeType),
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
    },
    description: {
      type: String,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
    read: {
      type: Boolean,
      default: false,
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
notificationSchema.pre('find', function () {
  this.find({ isDeleted: { $ne: true } })
})

notificationSchema.pre('findOne', function () {
  this.find({ isDeleted: { $ne: true } })
})

notificationSchema.pre('aggregate', function () {
  this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } })
})

export const Notification = model<TNotification>(
  'Notification',
  notificationSchema,
)
