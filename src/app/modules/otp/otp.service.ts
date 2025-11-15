import httpStatus from 'http-status'
import jwt, { JwtPayload, Secret } from 'jsonwebtoken'
import moment from 'moment'
import config from '../../config'
import AppError from '../../errors/AppError'
import { User } from '../user/user.model'
import { generateOtp } from '../../utils/generateOtp'
import emailSender from '../../utils/emailSender'
import { createToken, TExpiresIn } from '../auth/auth.utils'
import { Types } from 'mongoose'

const verifyWithEmail = async (token: string, otp: string | number) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized')
  }

  let decode
  try {
    decode = jwt.verify(token, config.jwt_access_secret as Secret) as JwtPayload
  } catch (err) {
    console.error(err)
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Session has expired. Please try to submit OTP within 5 minute',
    )
  }

  // console.log(decode)

  const user = await User.findOne({ email: decode?.email }).select(
    'verification status ',
  )
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }
  if (new Date() > user!.verification!.expiresAt!) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'OTP has expired. Please resend it',
    )
  }
  if (Number(otp) !== Number(user?.verification?.otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match')
  }

  const updateUser = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp: 0,
          expiresAt: moment().add(5, 'minute'),
          status: true,
        },
        expireAt: null, // set null to prevent verify user deletion data
      },
    },
    { new: true },
  ).select('email _id name role')

  const jwtPayload = {
    _id: updateUser?._id as Types.ObjectId,
    email: updateUser?.email as string,
    role: updateUser?.role as 'admin' | 'user',
  }

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as TExpiresIn,
  )

  return { accessToken }
}

const verifyWithPhoneNumber = async (token: string, otp: string | number) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized')
  }

  let decode
  try {
    decode = jwt.verify(token, config.jwt_access_secret as Secret) as JwtPayload
  } catch (err) {
    console.error(err)
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Session has expired. Please try to submit OTP within 5 minute',
    )
  }

  // console.log(decode)

  const user = await User.findOne({ phoneNumber: decode?.phoneNumber }).select(
    'verification status ',
  )
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }
  if (new Date() > user!.verification!.expiresAt!) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'OTP has expired. Please resend it',
    )
  }
  if (Number(otp) !== Number(user?.verification?.otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match')
  }

  const updateUser = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp: 0,
          expiresAt: moment().add(5, 'minute'),
          status: true,
        },
        expireAt: null, // set null to prevent verify user deletion data
      },
    },
    { new: true },
  ).select('email _id name role')

  const jwtPayload = {
    _id: updateUser?._id as Types.ObjectId,
    email: updateUser?.email as string,
    role: updateUser?.role as 'admin' | 'consult' | 'expert',
  }

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as TExpiresIn,
  )

  return { accessToken }
}

const sendOtpInEmail = async (email: string) => {
  const user = await User.findOne({ email })

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  const updateOtp = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp,
          expiresAt,
          status: false,
        },
      },
    },
    { new: true },
  )

  if (!updateOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Failed to resend OTP. Please try again later',
    )
  }

  const jwtPayload = {
    email: user?.email,
    userId: user?._id,
  }
  const token = jwt.sign(jwtPayload, config.jwt_access_secret as Secret, {
    expiresIn: '5m',
  })

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
          <p style="color: #555;">Thank you,<br/>Consultz App Team</p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
          <p>&copy; ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
        </div>
      </div>
    `,
  )

  return { token }
}

const sendOtpInPhone = async (phoneNumber: string) => {
  const user = await User.findOne({ phoneNumber })
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  const updateOtp = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp,
          expiresAt,
          status: false,
        },
      },
    },
    { new: true },
  )

  if (!updateOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Failed to resend OTP. Please try again later',
    )
  }

  const jwtPayload = {
    phoneNumber: user?.phoneNumber,
    userId: user?._id,
  }
  const token = jwt.sign(jwtPayload, config.jwt_access_secret as Secret, {
    expiresIn: '5m',
  })

  // For Test purpose sent response in phone number
  return { token, otp }
}

export const otpServices = {
  verifyWithEmail,
  verifyWithPhoneNumber,
  sendOtpInEmail,
  sendOtpInPhone,
}
