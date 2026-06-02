import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { BlockProfileService } from './blockProfile.service';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';

const blockUserProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await BlockProfileService.blockUserProfile(
    req.user._id,
    req.params.blockedId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile block successfully',
    data: result,
  });
});

const unblockProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await BlockProfileService.unblockProfile(
    req.user._id,
    req.params.blockedId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile unblock successfully',
    data: result,
  });
});

const getMyBlockProfile = catchAsync(async (req: Request, res: Response) => {
  req.query['blocker'] = req.user._id;
  const result = await BlockProfileService.getAllBlockProfile(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My block profiles fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getBlockProfileById = catchAsync(async (req: Request, res: Response) => {
  const result = await BlockProfileService.getBlockProfileById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'A profile block fetched successfully',
    data: result,
  });
});

export const BlockProfileController = {
  blockUserProfile,
  getMyBlockProfile,
  getBlockProfileById,
  unblockProfile,
};
