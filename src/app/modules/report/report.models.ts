import mongoose, { Schema } from 'mongoose';
import { IReport, IReportModel } from './report.interface';

const reportSchema: Schema<IReport> = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    feed: {
      type: Schema.Types.ObjectId,
      refPath: 'Feed',
      required: true,
    },
    feedAuthor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export const Report = mongoose.model<IReport, IReportModel>(
  'Report',
  reportSchema,
);
