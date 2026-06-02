import { Schema, model } from 'mongoose'
import { CALLING_STATUS } from './calling.constant'

const callingSchema = new Schema(
  {
    caller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['caller', 'receiver'] },
        status: {
          type: String,
          enum: Object.values(CALLING_STATUS),
        },
        joinedAt: Date,
        leftAt: Date,
        agoraUid: Number,
      },
    ],

    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },

    channelName: {
      type: String,
      required: true,
    },
    isVideo: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: Object.values(CALLING_STATUS),
      default: CALLING_STATUS.pending,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0, // seconds
    },
    token: {
      type: String,
      default: null,
    },
    tokenExpireAt: {
      type: Number,
      required: true,
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

export const Calling = model('Calling', callingSchema)
