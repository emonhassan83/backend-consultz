import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import { CallingService } from './calling.service';

const startCalling = catchAsync(async (req: Request, res: Response) => {
  const result = await CallingService.startCalling(req.user._id, req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Calling started successfully',
    data: result,
  });
});

export const CallingController = {
  startCalling,
};