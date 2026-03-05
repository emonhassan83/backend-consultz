import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { SupportService } from './support.service'

const createSupport = catchAsync(async (req, res) => {
  const result = await SupportService.createSupportIntoDB(req.body, req.user._id)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Support created successfully!',
    data: result,
  })
})

const sentSupportMessage = catchAsync(async (req, res) => {
  const result = await SupportService.sentSupportMessageIntoDB(req.params.id, req.body)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Support message sent successfully!',
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

const getASupport = catchAsync(async (req, res) => {
  const result = await SupportService.getASupportFromDB(req.params.id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Support retrieved successfully!',
    data: result,
  })
})

const deleteASupport = catchAsync(async (req, res) => {
  const result = await SupportService.deleteASupportFromDB(req.params.id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Support deleted successfully!',
    data: result,
  })
})

export const SupportControllers = {
  createSupport,
  sentSupportMessage,
  getAllSupports,
  getASupport,
  deleteASupport,
}
