import mongoose, { Schema } from 'mongoose';
import { IReport, IReportModel } from './card.interface';
import { REPORT_STATUS } from './card.constant';

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
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.pending,
    },
  },
  { timestamps: true },
);

export const Report = mongoose.model<IReport, IReportModel>(
  'Report',
  reportSchema,
);
