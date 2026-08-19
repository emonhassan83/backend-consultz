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

const getAllAppeals = catchAsync(async (req, res) => {
  const result = await AppealService.getAllAppealsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Appeals retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

const decideAppeal = catchAsync(async (req, res) => {
  const result = await AppealService.decideAppealIntoDB(
    req.params.id as string,
    req.body,
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Appeal decision updated successfully!',
    data: result,
  })
})

export const AppealController = {
  createAppeal,
  getAllAppeals,
  decideAppeal,
}
