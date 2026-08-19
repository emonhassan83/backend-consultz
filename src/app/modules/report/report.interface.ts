import { Model, Types } from 'mongoose';

export interface IReport {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  feed: Types.ObjectId;
  reason: string;
}

export type IReportModel = Model<IReport, Record<string, unknown>>;
