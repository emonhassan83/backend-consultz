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
// Follower counts on profiles filter by `following` (load test, 28 Nov)
followSchema.index({ following: 1, createdAt: -1 });

export const Follow = mongoose.model<IFollow, IFollowModel>(
  'Follow',
  followSchema,
);
