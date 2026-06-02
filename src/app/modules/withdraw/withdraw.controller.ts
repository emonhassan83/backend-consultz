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

const getConsultWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawService.getConsultWithdrawsFromDB(req.query, req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Consult withdraw retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getAllWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawService.getAllWithdrawsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'All Withdraw retrieved successfully!',
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
  getAllWithdraw,
  getConsultWithdraw,
  getAWithdraw,
  updateWithdraw
}
