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
import twilio from 'twilio'
import { USER_ROLE } from '../user/user.constant'
import { sendExpertPendingEmail } from '../user/user.utils'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'

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

  // If OTP is correct, update verification status and return access token
  const pointsToAdd = 100
  const newPoints = (user.points || 0) + pointsToAdd

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
        points: newPoints,
      },
    },
    { new: true },
  )

  // Send push notification to the user
  if (user.fcmToken && user.pushNotify?.points) {
    await sendNotification([user.fcmToken], {
      receiver: user._id,
      message: 'Earn Points!',
      description:
        'Congratulations! You have earned 100 points for fully completing your profile. 🎉',
      reference: user._id,
      modelType: modeType.Achievement,
    })
  }

  // Send pending review email to expert
  if (user.role === USER_ROLE.expert) {
    await sendExpertPendingEmail(user)
  }

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
          status: true,
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

const sendOtpViaTokenInPhone = async (
  userId: string,
  payload: { phoneNumber: string },
) => {
  const { phoneNumber } = payload

  const user = await User.findById(userId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  // ডাটাবেসে OTP সেভ করা
  const updateOtp = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp,
          expiresAt,
          status: true,
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

  // === মক মোড চেক করা ===
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    console.log('🔑 [MOCK OTP] Phone:', phoneNumber)
    console.log('🔑 [MOCK OTP] Code:', otp)
    console.log(
      '🔑 [MOCK OTP] Expires at:',
      expiresAt.format('YYYY-MM-DD HH:mm:ss'),
    )
    console.log('⚠️  Real SMS skipped in development mode')

    // টেস্টের জন্য OTP রিটার্ন করছি (প্রোডাকশনে এটা রিমুভ করবেন)
    return {
      token,
      otp,
      mock: true,
    }
  }

  // === প্রোডাকশন মোড: রিয়েল Twilio SMS ===
  const client = twilio(config.twilio.accountSid, config.twilio.authToken)

  try {
    await client.messages.create({
      body: `Your verification code is ${otp}. It expires in 5 minutes. Do not share it.`,
      from: config.twilio.phoneNumber,
      to: phoneNumber,
    })

    return {
      token,
    }
  } catch (error: any) {
    console.error('Twilio SMS Error:', error)
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send OTP')
  }
}

const sendOtpViaDirectPhone = async (payload: { phoneNumber: string }) => {
  const { phoneNumber } = payload

  const user = await User.findOne({ phoneNumber })
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  // ডাটাবেসে OTP সেভ করা
  const updateOtp = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp,
          expiresAt,
          status: true,
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

  // === মক মোড চেক করা ===
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    console.log('🔑 [MOCK OTP] Phone:', phoneNumber)
    console.log('🔑 [MOCK OTP] Code:', otp)
    console.log(
      '🔑 [MOCK OTP] Expires at:',
      expiresAt.format('YYYY-MM-DD HH:mm:ss'),
    )
    console.log('⚠️  Real SMS skipped in development mode')

    // টেস্টের জন্য OTP রিটার্ন করছি (প্রোডাকশনে এটা রিমুভ করবেন)
    return {
      token,
      otp,
      mock: true,
    }
  }

  // === প্রোডাকশন মোড: রিয়েল Twilio SMS ===
  const client = twilio(config.twilio.accountSid, config.twilio.authToken)

  try {
    await client.messages.create({
      body: `Your verification code is ${otp}. It expires in 5 minutes. Do not share it.`,
      from: config.twilio.phoneNumber,
      to: phoneNumber,
    })

    return {
      token,
    }
  } catch (error: any) {
    console.error('Twilio SMS Error:', error)
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send OTP')
  }
}

export const otpServices = {
  verifyWithEmail,
  verifyWithPhoneNumber,
  sendOtpInEmail,
  sendOtpViaTokenInPhone,
  sendOtpViaDirectPhone,
}
