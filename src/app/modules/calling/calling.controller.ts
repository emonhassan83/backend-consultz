import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import { CallingService } from './calling.service';

const generateToken = catchAsync(async (req: Request, res: Response) => {
  const result = await CallingService.generateCallToken(req.user._id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Token generated successfully!",
    data: result,
  });
});

const startCalling = catchAsync(async (req: Request, res: Response) => {
  const result = await CallingService.startCalling(req.user._id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Calling started successfully',
    data: result,
  });
});

const endCalling = catchAsync(async (req: Request, res: Response) => {
  const result = await CallingService.endCalling(req.body, req.user._id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Call ended successfully!',
    data: result,
  });
});

const getMyCalls = catchAsync(async (req: Request, res: Response) => {
  const result = await CallingService.getMyCalls(req.user._id);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'My calls retrieved successfully!',
    data: result,
  });
});

export const CallingController = {
  generateToken,
  startCalling,
  endCalling,
  getMyCalls
};