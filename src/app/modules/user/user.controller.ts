import catchAsync from '../../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../../utils/sendResponse'
import { UserService } from './user.service'
import { Request, Response } from 'express'
import { uploadToS3 } from '../../utils/s3'
import { otpServices } from '../otp/otp.service'
import { UploadedFiles } from '../../interface/common.interface'

const registerUser = catchAsync(async (req, res) => {
  const result = await UserService.registerUserIntoDB(req?.body)
  const sendOtp = await otpServices.sendOtpInPhone(result.phoneNumber as string)
  const { _id, id, firstName, lastName, email, phoneNumber, status } = result

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'User registered successfully!',
    data: {
      user: { _id, id, firstName, lastName, email, phoneNumber, status },
      otpToken: sendOtp,
    },
  })
})

const getInterestExpert = catchAsync(async (req, res) => {
  const result = await UserService.getInterestExpertsFromDB(
    req.user._id,
    req.query,
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Interest experts retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})


// 🔥 Top Experts
const getTopExperts = catchAsync(async (req, res) => {
  const result = await UserService.getTopExpertsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Top experts retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

// 🏠 Property Experts
const getPropertyExperts = catchAsync(async (req, res) => {
  const result = await UserService.getPropertyExpertsFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Property experts retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getAllUsers = catchAsync(async (req, res) => {
  const result = await UserService.getAllUsersFromDB(req.query)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Users retrieved successfully!',
    meta: result.meta,
    data: result.result,
  })
})

const getUserById = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.geUserByIdFromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User fetched successfully',
    data: result,
  })
})

const getMyProfile = catchAsync(
  async (req: Request & { user?: any }, res: Response) => {
    const result = await UserService.geUserByIdFromDB(req?.user?._id)

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'My profile fetched successfully!',
      data: result,
    })
  },
)

const changeUserStatus = catchAsync(async (req, res) => {
  const result = await UserService.changeUserStatusFromDB(req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User status update successfully!',
    data: result,
  })
})

const changeUserNotify = catchAsync(async (req, res) => {
  const result = await UserService.changeUserNotifyFromDB(req.user._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User notify status changed successfully!',
    data: result,
  })
})

const updateUserInfo = catchAsync(async (req, res) => {
   if (req.files) {
    const { image, cover } = req.files as UploadedFiles;

    if (image?.length) {
      const uploadedPhoto = await uploadToS3({
        file: image[0],
        fileName: `images/user/photoUrl/${Math.floor(100000 + Math.random() * 900000)}`,
      });
      req.body.photoUrl = uploadedPhoto as string;
    }

    if (cover?.length) {
      const uploadedCover = await uploadToS3({
        file: cover[0],
        fileName: `images/user/cover/${Math.floor(100000 + Math.random() * 900000)}`,
      });
      req.body.coverPhoto = uploadedCover as string;
    }
  }

  const result = await UserService.updateUserInfoFromDB(req.params.id, req.body)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User info update successfully!',
    data: result,
  })
})

const updateMyProfile = catchAsync(async (req, res) => {
  if (req.files) {
    const { image, cover } = req.files as UploadedFiles;

    if (image?.length) {
      const uploadedPhoto = await uploadToS3({
        file: image[0],
        fileName: `images/user/photoUrl/${Math.floor(100000 + Math.random() * 900000)}`,
      });
      req.body.photoUrl = uploadedPhoto as string;
    }

    if (cover?.length) {
      const uploadedCover = await uploadToS3({
        file: cover[0],
        fileName: `images/user/cover/${Math.floor(100000 + Math.random() * 900000)}`,
      });
      req.body.coverPhoto = uploadedCover as string;
    }
  }

  const result = await UserService.updateUserInfoFromDB(
    req?.user?._id,
    req.body,
  )

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'My profile info update successfully!',
    data: result,
  })
})

const deleteMyProfile = catchAsync(async (req, res) => {
  const result = await UserService.deleteAUserFromDB(req?.user?._id)

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User delete successfully!',
    data: result,
  })
})

export const UserControllers = {
  registerUser,
  getAllUsers,
  getInterestExpert,
  getTopExperts,
  getPropertyExperts,
  getUserById,
  getMyProfile,
  changeUserStatus,
  updateUserInfo,
  updateMyProfile,
  changeUserNotify,
  deleteMyProfile,
}
