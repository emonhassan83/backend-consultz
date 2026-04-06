import bcrypt from 'bcrypt'
import httpStatus from 'http-status'
import config from '../../config'
import AppError from '../../errors/AppError'
import { JwtPayload } from 'jsonwebtoken'
import emailSender from '../../utils/emailSender'
import { User } from '../user/user.model'
import {
  authNotifyUser,
  createToken,
  generateTokens,
  TExpiresIn,
  verifyToken,
} from './auth.utils'
import {
  TAppleLoginPayload,
  TGoogleLoginPayload,
  TLoginUser,
} from './auth.interface'
import { generateOtp } from '../../utils/generateOtp'
import moment from 'moment'
import { REGISTER_WITH } from '../user/user.constant'

const loginUser = async (payload: TLoginUser) => {
  //* checking if the user is exist
  const user = await User.isUserExistsByEmail(payload.email)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !')
  }

  //* checking if the password is correct
  if (!(await User.isPasswordMatched(payload?.password, user?.password)))
    throw new AppError(httpStatus.FORBIDDEN, 'Password do not matched')

  // if user is not verify yet throw error
  if (!user?.verification?.status) {
    throw new AppError(httpStatus.FORBIDDEN, 'Your profile is not verified')
  }

  //* create token and sent to the  client
  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  }

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as TExpiresIn,
  )

  const refreshToken = createToken(
    jwtPayload,
    config.jwt_refresh_secret as string,
    config.jwt_refresh_expires_in as TExpiresIn,
  )

  //* 5. Prepare update object for FCM + location
  const updateData: any = {}

  if (payload.fcmToken) {
    updateData.fcmToken = payload.fcmToken
  }

  // If coordinates provided, update GeoJSON location
  if (payload.latitude && payload.longitude) {
    updateData.location = {
      type: 'Point',
      coordinates: [payload.longitude, payload.latitude],
    }
  }

  //* 6. Update user document if needed
  if (Object.keys(updateData).length > 0) {
    await User.findByIdAndUpdate(user._id, updateData, { new: true })
  }

  return {
    accessToken,
    refreshToken,
    user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isProfileSetup: user.isProfileSetup,
      status: user.status,
    },
  }
}

const registerWithGoogle = async (payload: TGoogleLoginPayload) => {
  if (payload.role === 'admin') {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You cannot directly assign admin role',
    )
  }

  const user = await User.isUserExistsByEmail(payload.email as string)

  const updateData: any = {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    photoUrl: payload.photoUrl,
    fcmToken: payload.fcmToken,
  }

  // Add coordinates if provided
  if (payload.latitude && payload.longitude) {
    updateData.location = {
      type: 'Point',
      coordinates: [payload.longitude, payload.latitude],
    }
  }

  if (user) {
    // Validate registration method
    if (user.registerWith !== REGISTER_WITH.google) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `This account is registered with ${user.registerWith}, please use that method.`,
      )
    }

    // Reactivate if deleted
    if (user.isDeleted) {
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          ...updateData,
          isDeleted: false,
          verification: { otp: 0, expiresAt: new Date(), status: true },
          expireAt: null,
        },
        { new: true },
      )

      if (!updatedUser) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to reactivate deleted user.',
        )
      }

      return generateTokens(updatedUser)
    }

    // Otherwise, update coordinates & FCM token silently
    await User.findByIdAndUpdate(user._id, updateData, { new: true })
    return generateTokens(user)
  }

  // Create new user if not exists
  const newUser = await User.create({
    ...updateData,
    registerWith: REGISTER_WITH.google,
    verification: { otp: 0, expiresAt: new Date(), status: true },
    expireAt: null,
  })

  if (!newUser) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create user!',
    )
  }

  return generateTokens(newUser)
}

const registerWithApple = async (payload: TAppleLoginPayload) => {
  if (payload.role === 'admin') {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You cannot directly assign admin role',
    )
  }

  const user = await User.isUserExistsByEmail(payload.email as string)

  const updateData: any = {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    photoUrl: payload.photoUrl,
    fcmToken: payload.fcmToken,
  }

  if (payload.latitude && payload.longitude) {
    updateData.location = {
      type: 'Point',
      coordinates: [payload.longitude, payload.latitude],
    }
  }

  if (user) {
    if (user.registerWith !== REGISTER_WITH.apple) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `This account is registered with ${user.registerWith}, please use that method.`,
      )
    }

    if (user.isDeleted) {
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          ...updateData,
          isDeleted: false,
          verification: { otp: 0, expiresAt: new Date(), status: true },
          expireAt: null,
        },
        { new: true },
      )

      if (!updatedUser) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to reactivate deleted user.',
        )
      }

      return generateTokens(updatedUser)
    }

    await User.findByIdAndUpdate(user._id, updateData, { new: true })
    return generateTokens(user)
  }

  const newUser = await User.create({
    ...updateData,
    registerWith: REGISTER_WITH.apple,
    verification: { otp: 0, expiresAt: new Date(), status: true },
    expireAt: null,
  })

  if (!newUser) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create user!',
    )
  }

  return generateTokens(newUser)
}

const changePassword = async (
  userData: JwtPayload,
  payload: { oldPassword: string; newPassword: string },
) => {
  //* checking if the user is exist
  const user = await User.isUserExistsByEmail(userData?.email)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !')
  }

  //* checking if the password is correct
  if (!(await User.isPasswordMatched(payload.oldPassword, user?.password)))
    throw new AppError(httpStatus.FORBIDDEN, 'Password do not matched')

  //* hash new password
  const newHashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds),
  )

  const updateUserPassword = await User.findOneAndUpdate(
    {
      _id: userData._id,
      role: userData.role,
    },
    {
      $set: {
        password: newHashedPassword,
        needsPasswordChange: false,
        passwordChangedAt: new Date(),
      },
    },
    { new: true },
  )

  //if password is not updated throw error
  if (!updateUserPassword) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Password was not updated. Please try again!',
    )
  }

  // Send a notification to the user informing them about the successful password change
  user?.role === 'admin' && (await authNotifyUser('PASSWORD_CHANGE', user))

  return null
}

const refreshToken = async (token: string) => {
  //* checking if the given token is valid
  const decoded = verifyToken(token, config.jwt_refresh_secret as string)

  //* checking if the user is exist
  const user = await User.isUserExistsByEmail(decoded?.email)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !')
  }

  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  }

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as TExpiresIn,
  )

  return {
    accessToken,
  }
}

const forgetPassword = async (payload: { email: string }) => {
  //* checking if the user is exist
  const user = await User.isUserExistsByEmail(payload.email)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !')
  }

  //* create token and sent to the  client
  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  }

  const resetToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    '5m',
  )

  const currentTime = new Date()
  const otp = generateOtp()
  const expiresAt = moment(currentTime).add(5, 'minute')

  await User.findByIdAndUpdate(user?._id, {
    verification: {
      otp,
      expiresAt,
      status: true,
    },
  })

  // const resetUILink = `${config.reset_pass_link}?id=${user._id}&token=${resetToken} `

  await emailSender(
    user?.email,
    'Your One-Time OTP',
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: left; padding: 10px 20px;">
          <h2 style="color: #333;">Your One-Time OTP</h2>
          <p style="color: #555; margin-top: 10px;">Dear ${user?.firstName},</p>
          <p style="color: #555;">Use the following One-Time Password (OTP) to proceed with your request. This OTP is valid for a limited time.</p>
          <div style="text-align: center; margin: 20px 0;">
            <span style="padding: 10px 20px; font-size: 18px; font-weight: bold; border-radius: 5px; display: inline-block;">
              ${otp}
            </span>
          </div>
          <p style="color: #555;">This OTP is valid until: <strong>${expiresAt.toLocaleString()}</strong></p>
          <p style="color: #555;">If you did not request this OTP, please ignore this email.</p>
          <p style="color: #555;">Thank you,<br/>Consultz Team</p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
          <p>&copy; ${new Date().getFullYear()} Consultz. All rights reserved.</p>
        </div>
      </div>
    `,
  )

  return { verifyToken: resetToken }
}

const resetPassword = async (
  payload: { email: string; newPassword: string; confirmPassword: string },
  token: string,
) => {
  //* checking if the user is exist
  const user = await User.isUserExistsByEmail(payload?.email)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !')
  }

  // if session is expired
  if (new Date() > user!.verification!.expiresAt!) {
    throw new AppError(httpStatus.FORBIDDEN, 'Session has expired')
  }

  // if user verification status is not available
  if (!user?.verification?.status) {
    throw new AppError(httpStatus.FORBIDDEN, 'OTP is not verified yet')
  }

  const decoded = verifyToken(token, config.jwt_access_secret as string)
  if (payload.email !== decoded.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are forbidden!')
  }

  // if new password and confirm Password is not match
  if (payload?.newPassword !== payload?.confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'New password and confirm password do not match',
    )
  }

  //* hash new password
  const newHashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds),
  )

  const passwordResetUser = await User.findOneAndUpdate(
    {
      _id: decoded._id,
      role: decoded.role,
    },
    {
      $set: {
        password: newHashedPassword,
        passwordChangedAt: new Date(),
        verification: {
          otp: 0,
          status: true,
        },
      },
    },
    { new: true },
  )

  //if password is not updated throw error
  if (!passwordResetUser) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Password was not reset. Please try again!',
    )
  }

  // Send a notification to the admin informing them about the password reset
  user?.role === 'admin' && (await authNotifyUser('PASSWORD_RESET', user))
}

export const AuthServices = {
  loginUser,
  registerWithGoogle,
  registerWithApple,
  changePassword,
  refreshToken,
  forgetPassword,
  resetPassword,
}
