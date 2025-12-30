import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { ReportService } from './report.service';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';

const createReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.createReport(req.body);

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

const getMyReport = catchAsync(async (req: Request, res: Response) => {
  req.query['author'] = req.user.userId;
  const result = await ReportService.getAllReport(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report histories fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getReportById = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getReportById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report history fetched successfully',
    data: result,
  });
});

const updateReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.updateReport(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report history updated successfully',
    data: result,
  });
});

const changeStatusReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.changeStatusReport(
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report history status change successfully',
    data: result,
  });
});

const deleteReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.deleteReport(req.params.id);

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
  getMyReport,
  getReportById,
  updateReport,
  changeStatusReport,
  deleteReport,
};
