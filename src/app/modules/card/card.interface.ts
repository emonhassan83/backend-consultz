import { Model, Types } from 'mongoose';
import { TReportStatus } from './card.constant';

export interface IReport {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  feed: Types.ObjectId;
  reason: string;
  status: TReportStatus;
}

export type IReportModel = Model<IReport, Record<string, unknown>>;
