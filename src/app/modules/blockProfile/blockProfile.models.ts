import mongoose, { Schema } from 'mongoose';
import { IBlockProfile, IBlockProfileModel } from './blockProfile.interface';

const blockProfileSchema: Schema<IBlockProfile> = new Schema(
  {
    blocker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blocked: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

export const BlockProfile = mongoose.model<IBlockProfile, IBlockProfileModel>(
  'BlockProfile',
  blockProfileSchema,
);
