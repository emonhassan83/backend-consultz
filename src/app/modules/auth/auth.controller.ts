import httpStatus from 'http-status'
import catchAsync from '../../utils/catchAsync'
import sendResponse from '../../utils/sendResponse'
import { AuthServices } from './auth.service'
import config from '../../config'

const loginUser = catchAsync(async (req, res) => {
  const result = await AuthServices.loginUser(req.body)
  const { refreshToken, accessToken, user } = result

  res.cookie('refreshToken', refreshToken, {
    secure: config.node_env === 'production',
    httpOnly: true,
    sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 365,
  })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User login successfully!',
    data: {
      accessToken,
      user
    },
  })
})

const registerWithGoogle = catchAsync(async (req, res) => {
  const result = await AuthServices.registerWithGoogle(req.body)
  const { refreshToken } = result

  const cookieOptions: any = {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 365,
  }

  if (config.node_env === 'production') {
    cookieOptions.sameSite = 'none'
  }
  res.cookie('refreshToken', refreshToken, cookieOptions)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logged in successfully',
    data: result,
  })
})

const registerWithApple = catchAsync(async (req, res) => {
  const result = await AuthServices.registerWithApple(req.body)
  const { refreshToken } = result

  const cookieOptions: any = {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 365,
  }

  if (config.node_env === 'production') {
    cookieOptions.sameSite = 'none'
  }
  res.cookie('refreshToken', refreshToken, cookieOptions)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logged in successfully',
    data: result,
  })
})

const changePassword = catchAsync(async (req, res) => {
  const result = await AuthServices.changePassword(req.user, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password is updated successfully!',
    data: result,
  })
})

const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies
  const result = await AuthServices.refreshToken(refreshToken)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Access token is retrieved successfully!',
    data: result,
  })
})

const forgetPassword = catchAsync(async (req, res) => {
  const result = await AuthServices.forgetPassword(req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reset link is generated successfully! Check your email!',
    data: result,
  })
})

const resetPassword = catchAsync(async (req, res) => {
  const token = req.headers.authorization

  const result = await AuthServices.resetPassword(req.body, token as string)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password reset successful!',
    data: result,
  })
})

export const AuthControllers = {
  loginUser,
  registerWithGoogle,
  registerWithApple,
  changePassword,
  refreshToken,
  forgetPassword,
  resetPassword,
}
