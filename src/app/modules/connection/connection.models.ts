import mongoose, { Schema } from 'mongoose';
import { IFollow, IFollowModel } from './connection.interface';

const followSchema: Schema<IFollow> = new Schema(
  {
    follower: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    following: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });

export const Follow = mongoose.model<IFollow, IFollowModel>(
  'Follow',
  followSchema,
);
