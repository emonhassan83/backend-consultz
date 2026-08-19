import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { AppealService } from './appeal.service'

const createAppeal = catchAsync(async (req, res) => {
  const result = await AppealService.createAppealIntoDB(req.body, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Appeal submitted successfully!',
    data: result,
  })
})

const getAppealsByFeed = catchAsync(async (req, res) => {
  const result = await AppealService.getAppealsByFeedFromDB(
    req.params.feedId as string,
    req.query,
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Appeals retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

export const AppealController = {
  createAppeal,
  getAppealsByFeed,
}
