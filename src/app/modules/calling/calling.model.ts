import { Schema, model } from 'mongoose';
import { CALLING_STATUS } from './calling.constant';

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
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    channelName: {
      type: String,
      required: true,
    },
    callId: {
      type: Number,
      required: true,
    },
    isVideo: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: Object.values(CALLING_STATUS),
      default: CALLING_STATUS.PENDING,
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
      required: true,
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
);

export const Calling = model('Calling', callingSchema);