import { Schema, model } from 'mongoose';

const profileViewSchema = new Schema(
  {
    viewer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    viewedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: one view per viewer-viewedUser pair
profileViewSchema.index({ viewer: 1, viewedUser: 1 }, { unique: true });
// 7-day view count on profiles (load test, 28 Nov)
profileViewSchema.index({ viewedUser: 1, viewedAt: -1 });

export const ProfileView = model('ProfileView', profileViewSchema);