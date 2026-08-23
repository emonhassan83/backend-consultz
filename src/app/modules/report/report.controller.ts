import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { ReportService } from './report.service';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';

const createReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.createReport(req.body, req.user._id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report added successfully',
    data: result,
  });
});

const getAllReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getAllReport(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report histories fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getReportsByFeed = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getReportsByFeed(
    req.params.feedId as string,
    req.query,
    req.user._id as string,
    req.user.role,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feed report histories fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const deleteReportByFeedId = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.deleteReportByFeedId(
    req.params.feedId as string,
    req.user._id as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feed reports deleted successfully',
    data: result,
  });
});

const getReportById = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getReportById(
    req.params.id as string,
    req.user?._id as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report history fetched successfully',
    data: result,
  });
});

const deleteReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.deleteReport(req.params.id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report history deleted successfully',
    data: result,
  });
});

export const ReportController = {
  createReport,
  getAllReport,
  getReportsByFeed,
  deleteReportByFeedId,
  getReportById,
  deleteReport,
};
