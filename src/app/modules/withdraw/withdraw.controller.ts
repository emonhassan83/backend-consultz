import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { WithdrawService } from './withdraw.service'

const addWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawService.addWithdraw(req.body, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw insert successfully!',
    data: result,
  })
})

const getAllMyWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawService.getAllWithdrawsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My Withdraw retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getAWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawService.getAWithdrawFromDB(req.params.id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw retrieved successfully!',
    data: result,
  })
})

const updateWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawService.updateWithdrawFromDB(
    req.params.id,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Withdraw update successfully!',
    data: result,
  })
})

export const WithdrawControllers = {
  addWithdraw,
  getAllMyWithdraw,
  getAWithdraw,
  updateWithdraw
}
