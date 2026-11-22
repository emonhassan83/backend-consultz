import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import { otpServices } from './otp.service'
import sendResponse from '../../utils/sendResponse'
import { Request, Response } from 'express'

const verifyWithEmail = catchAsync(async (req: Request, res: Response) => {
  const token = req?.headers?.authorization
  const result = await otpServices.verifyWithEmail(token as string, req.body.otp)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP verified successfully',
    data: result,
  })
})

const verifyWithPhoneNumber = catchAsync(async (req: Request, res: Response) => {
  const token = req?.headers?.authorization
  const result = await otpServices.verifyWithPhoneNumber(token as string, req.body.otp)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP verified successfully',
    data: result,
  })
})

const sendOtpInEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await otpServices.sendOtpInEmail(req.body.email)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP sent successfully',
    data: result,
  })
})

const changeSignupEmail = catchAsync(async (req: Request, res: Response) => {
  const token = req?.headers?.authorization
  const result = await otpServices.changeSignupEmail(
    token as string,
    req.body.newEmail,
  )

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Email updated. We sent a new code to it.',
    data: result,
  })
})

const sendOtpViaTokenInPhone = catchAsync(async (req: Request, res: Response) => {
  const result = await otpServices.sendOtpViaTokenInPhone(req.user._id, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP sent successfully',
    data: result,
  })
})

const sendOtpViaDirectPhone = catchAsync(async (req: Request, res: Response) => {
  const result = await otpServices.sendOtpViaDirectPhone(req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP sent successfully',
    data: result,
  })
})

export const otpControllers = {
  verifyWithEmail,
  verifyWithPhoneNumber,
  sendOtpInEmail,
  changeSignupEmail,
  sendOtpViaTokenInPhone,
  sendOtpViaDirectPhone
}
