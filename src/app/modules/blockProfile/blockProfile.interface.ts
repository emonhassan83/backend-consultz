import { Model, Types } from 'mongoose';

export interface IBlockProfile {
  blocker: Types.ObjectId;
  blocked: Types.ObjectId;
}

export type IBlockProfileModel = Model<IBlockProfile, Record<string, unknown>>;
