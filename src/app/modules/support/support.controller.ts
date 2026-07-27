import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { SupportService } from './support.service'

const createSupport = catchAsync(async (req, res) => {
  const result = await SupportService.sendSupportEmail(req.body, req.user._id)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: result?.message,
    data: result,
  })
})

const sentSupportMessage = catchAsync(async (req, res) => {
  const result = await SupportService.sentSupportMessageIntoDB(req.params.id as string, req.body)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: result?.messages,
    data: null,
  })
})

const sentFeedbackEmail = catchAsync(async (req, res) => {
  const result = await SupportService.sendFeedbackEmail(req.body, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: result.message,
    data: result,
  })
})

const getAllSupports = catchAsync(async (req, res) => {
  const result = await SupportService.getAllSupportsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Supports retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const deleteASupport = catchAsync(async (req, res) => {
  const result = await SupportService.deleteASupportFromDB(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Support deleted successfully!',
    data: result,
  })
})

export const SupportControllers = {
  createSupport,
  sentFeedbackEmail,
  sentSupportMessage,
  getAllSupports,
  deleteASupport,
}
