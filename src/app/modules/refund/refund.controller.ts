import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import httpStatus from 'http-status'
import { RefundService } from './refund.service'

const getAllRefunds = catchAsync(async (req, res) => {
  const result = await RefundService.getAllRefundsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Refunds retrieved successfully!',
    meta: result.meta,
    data: result.data,
  })
})

export const RefundController = {
  getAllRefunds,
}
