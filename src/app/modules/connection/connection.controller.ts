import { Request, Response } from 'express'
import catchAsync from '../../utils/catchAsync'
import { FollowService } from './connection.service'
import sendResponse from '../../utils/sendResponse'
import httpStatus from 'http-status'

const followUser = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.followUser(req.user._id, req.params.id)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Followed user successfully !',
    data: result,
  })
})

const unfollowUser = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.unfollowUser(req.user._id, req.params.id)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Unfollowed user successfully !',
    data: result,
  })
})

const getMyFollowers = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.getAllFollowers(req.user._id, req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All followers fetched successfully',
    meta: result.meta,
    data: result.result,
  })
})

const getUserFollowers = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.getAllFollowers(req.params.userId, req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All followers fetched successfully',
    meta: result.meta,
    data: result.result,
  })
})

const getMyFollowing = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.getAllFollowing(req.user._id, req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All following fetched successfully',
    meta: result.meta,
    data: result.result,
  })
})

const getUserFollowing = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.getAllFollowing(req.params.id, req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All following fetched successfully',
    meta: result.meta,
    data: result.result,
  })
})

const checkedFollowUser = catchAsync(async (req: Request, res: Response) => {
  const result = await FollowService.checkedFollowUser(
    req.user.userId,
    req.params.id,
  )

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Profile follow user checked !',
    data: result,
  })
})

export const FollowController = {
  followUser,
  unfollowUser,
  getMyFollowers,
  getUserFollowers,
  getMyFollowing,
  getUserFollowing,
  checkedFollowUser,
}
