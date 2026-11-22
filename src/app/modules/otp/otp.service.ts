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
import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import {
  assertEmailAvailable,
  assertPhoneAvailable,
  getSignupEmailChangeError,
  sendExpertPendingEmail,
} from '../user/user.utils'
import { normalizePhone } from '../../utils/normalizePhone'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'
import { PointsService } from '../points/points.service'
import { POINTS_REWARD_KEY } from '../points/points.constant'
import {
  emailCaseInsensitiveFilter,
  normalizeEmail,
} from '../../utils/normalizeEmail'

// Resend OTP when no live account / sign-up exists (#15). The app should send
// the user back to the start of sign-up on this 404.
export const RESEND_EMAIL_NOT_FOUND_MESSAGE =
  'No account or sign-up in progress was found for this email. Please start sign-up again.'
export const RESEND_PHONE_NOT_FOUND_MESSAGE =
  'No account or sign-up in progress was found for this phone number. Please start sign-up again.'

const logTwilioSmsError = (
  context: 'sendOtpViaTokenInPhone' | 'sendOtpViaDirectPhone',
  phoneNumber: string,
  error: any,
) => {
  console.error(`[Twilio SMS Error][${context}]`, {
    phoneNumber,
    code: error?.code,
    status: error?.status,
    message: error?.message,
    moreInfo: error?.moreInfo,
    details: error?.details,
    raw: error,
  })
}

const verifyWithEmail = async (token: string, otp: string | number) => {
  const now = new Date()
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

  // Sign-up / resend tokens carry userId; forget-password tokens carry _id + email
  const userId = decode?.userId || decode?._id
  const user = await User.findOne(
    userId
      ? { _id: userId, isDeleted: false }
      : { ...emailCaseInsensitiveFilter(decode?.email), isDeleted: false },
  ).select(
    'verification status isEmailVerified isPhoneOtpVerified phoneNumber role email firstName lastName',
  )
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }
  if (!user.verification?.expiresAt || new Date() > user.verification.expiresAt) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'OTP has expired. Please resend it',
    )
  }
  if (!user.verification?.otp || Number(otp) !== Number(user.verification.otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match')
  }

  const wasEmailVerified = Boolean(user.isEmailVerified)

  // Completing sign-up claims the phone number. If two unverified sign-ups
  // used the same number, the first to verify keeps it (#12).
  if (!wasEmailVerified && !user.isPhoneOtpVerified) {
    await assertPhoneAvailable(user.phoneNumber, user._id)
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
        isEmailVerified: true,
        expireAt: null, // set null to prevent verify user deletion data
        lastLogAt: now,
      },
    },
    { returnDocument: 'after' },
  ).select('email _id name role')

  // First-time email verification completes sign-up: expert pending review email
  if (
    !wasEmailVerified &&
    user.status === USER_STATUS.pending &&
    user.role === USER_ROLE.expert
  ) {
    await sendExpertPendingEmail(user)
  }

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
  const now = new Date()
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized')
  }

  let decode: JwtPayload
  try {
    decode = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET as string,
    ) as JwtPayload
  } catch (err) {
    console.error(err)
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Session has expired. Please try to submit OTP within 5 minutes',
    )
  }

  const user = await User.findById(decode.userId).select(
    'verification status points isPhoneOtpVerified phoneNumber pendingPhoneNumber isDeleted fcmToken pushNotify role email firstName lastName',
  )

  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }

  if (new Date() > (user.verification?.expiresAt || 0)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'OTP has expired. Please resend it',
    )
  }

  // A used OTP is stored as 0, so 0 must never match
  if (
    !user.verification?.otp ||
    Number(otp) !== Number(user.verification.otp)
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match')
  }

  // The number being verified: a pending one from send-otp-via-token-in-phone
  // (social onboarding / phone change, #13), else the one given at register.
  const claimedPhone = user.pendingPhoneNumber || user.phoneNumber

  // Verifying claims the number; first to verify keeps it (#12)
  if (!user.isPhoneOtpVerified || user.pendingPhoneNumber) {
    await assertPhoneAvailable(claimedPhone, user._id)
  }

  const updateUser = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        verification: {
          otp: 0,
          expiresAt: moment().add(5, 'minute').toDate(),
          status: true,
        },
        expireAt: null,
        isPhoneOtpVerified: true,
        phoneNumber: claimedPhone,
        pendingPhoneNumber: null,
        lastLogAt: now,
      },
    },
    { returnDocument: 'after' },
  )

  if (!user.isPhoneOtpVerified) {
    await PointsService.awardByKey({
      userId: user._id,
      key: POINTS_REWARD_KEY.phone_verify,
      reason: 'Phone number verification reward',
    })
  }

  // Expert pending review email
  if (user.status === USER_STATUS.pending && user.role === USER_ROLE.expert) {
    await sendExpertPendingEmail(user)
  }

  // ✅ JWT Token Creation with proper expiresIn handling
  const jwtPayload = {
    _id: updateUser?._id as Types.ObjectId,
    email: updateUser?.email as string,
    role: updateUser?.role as 'admin' | 'consult' | 'expert',
  }

  // 🔥 Safe expiresIn handling
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '7d'

  // Type guard + fallback
  const validExpiresIn: TExpiresIn =
    typeof expiresIn === 'number' ||
    ['30s', '1m', '5m', '10m', '1h', '1d', '7d', '30d', '365d'].includes(
      expiresIn as string,
    )
      ? (expiresIn as TExpiresIn)
      : '7d' // default fallback

  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET as string,
    validExpiresIn,
  )

  return { accessToken }
}

const sendOtpInEmail = async (email: string) => {
  const normalized = normalizeEmail(email)
  const user =
    (await User.findOne({ email: normalized, isDeleted: false })) ??
    (await User.findOne({
      ...emailCaseInsensitiveFilter(normalized),
      isDeleted: false,
    }))

  // No live record: deleted, or an unverified sign-up removed by the TTL (#15)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, RESEND_EMAIL_NOT_FOUND_MESSAGE)
  }

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  // status stays false until the OTP is actually verified (verifyWithEmail)
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
    { returnDocument: 'after' },
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

  const html = `
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
    `

  // === Mock mode (same behaviour as phone OTP) ===
  // In development the OTP is returned in the response so sign-up can be
  // tested even when email delivery is not working. Real email is still tried.
  const isDevelopment = config.node_env !== 'production'

  if (isDevelopment) {
    console.log('🔑 [MOCK OTP] Email:', user.email)
    console.log('🔑 [MOCK OTP] Code:', otp)
    try {
      await emailSender(user.email, 'Your One-Time OTP', html)
    } catch (error) {
      console.error('[Email OTP Error][sendOtpInEmail] (ignored in dev)', error)
    }
    return { email: user.email, token, otp, mock: true }
  }

  await emailSender(user.email, 'Your One-Time OTP', html)

  // email lets the OTP screen show where the code went (#65)
  return { email: user.email, token }
}

/**
 * Fix a typo in the email of a sign-up that is still waiting for its OTP (#65).
 * Authorised by the sign-up token from register / send-otp-in-email.
 * Keeps the same record (phone, referral) and sends a new OTP to the new email.
 */
const changeSignupEmail = async (token: string, newEmailInput: string) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized')
  }

  let decode: JwtPayload
  try {
    decode = jwt.verify(token, config.jwt_access_secret as Secret) as JwtPayload
  } catch {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Session has expired. Please resend the code and try again.',
    )
  }

  const userId = decode?.userId
  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized')
  }

  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    'email registerWith isEmailVerified isPhoneOtpVerified',
  )
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, RESEND_EMAIL_NOT_FOUND_MESSAGE)
  }

  const newEmail = normalizeEmail(newEmailInput)
  const error = getSignupEmailChangeError({
    registerWith: user.registerWith,
    isEmailVerified: user.isEmailVerified,
    isPhoneOtpVerified: user.isPhoneOtpVerified,
    currentEmail: normalizeEmail(user.email),
    newEmail,
  })
  if (error) throw new AppError(httpStatus.BAD_REQUEST, error)

  await assertEmailAvailable(newEmail, user._id)

  await User.findByIdAndUpdate(user._id, {
    $set: {
      email: newEmail,
      // give the corrected sign-up a fresh hour before the TTL removes it
      expireAt: moment().add(60, 'minute').toDate(),
    },
  })

  return sendOtpInEmail(newEmail)
}

const sendOtpViaTokenInPhone = async (
  userId: string,
  payload: { phoneNumber: string },
) => {
  const phoneNumber = normalizePhone(payload.phoneNumber)

  const user = await User.findById(userId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  }

  // Don't send an OTP for a number another completed account owns (#12)
  await assertPhoneAvailable(phoneNumber, user._id)

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  // Save OTP and the number to verify. It only becomes phoneNumber after
  // verify-with-phone (#13).
  const updateOtp = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp,
          expiresAt,
          status: false,
        },
        pendingPhoneNumber: phoneNumber,
      },
    },
    { returnDocument: 'after' },
  )

  if (!updateOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Failed to resend OTP. Please try again later',
    )
  }

  const jwtPayload = {
    phoneNumber,
    userId: user?._id,
  }
  const token = jwt.sign(jwtPayload, config.jwt_access_secret as Secret, {
    expiresIn: '5m',
  })

  // === Mock mode test ===
  const isDevelopment = config.node_env !== 'production'

  if (isDevelopment) {
    console.log('🔑 [MOCK OTP] Phone:', phoneNumber)
    console.log('🔑 [MOCK OTP] Code:', otp)
    console.log(
      '🔑 [MOCK OTP] Expires at:',
      expiresAt.format('YYYY-MM-DD HH:mm:ss'),
    )
    console.log('⚠️  Real SMS skipped in development mode')

    // FOR TESTING PURPOSES: Returning OTP (remove in production)
    return {
      token,
      otp,
      mock: true,
    }
  }

  // === Production mode: Twilio SMS ===
  const client = twilio(config.twilio.accountSid, config.twilio.authToken)

  try {
    const res = await client.messages.create({
      body: `Welcome to Consultz. Your verification code is ${otp}. It expires in 5 minutes. Please do not share this code.`,
      from: config.twilio.phoneNumber,
      to: phoneNumber,
    })
    console.log('[Twilio SMS Success][sendOtpViaTokenInPhone]', {
      phoneNumber,
      sid: res?.sid,
      status: res?.status,
    })

    return {
      token,
    }
  } catch (error: any) {
    logTwilioSmsError('sendOtpViaTokenInPhone', phoneNumber, error)

    if (error.code === 21612) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This country code is currently not supported for OTP. Please try another number or contact support.',
      )
    }

    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send OTP')
  }
}

const sendOtpViaDirectPhone = async (payload: { phoneNumber: string }) => {
  const { phoneNumber } = payload

  // A soft-deleted account keeps its phone number, so without the isDeleted
  // filter the old record could be found first ("User not found", #15).
  // Newest live record wins.
  const normalizedPhone = normalizePhone(phoneNumber)
  const user = await User.findOne({
    phoneNumber: {
      $in: Array.from(new Set([normalizedPhone, phoneNumber.trim()])),
    },
    isDeleted: false,
  }).sort({ createdAt: -1 })
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, RESEND_PHONE_NOT_FOUND_MESSAGE)
  }

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  // Save OTP in the database
  const updateOtp = await User.findByIdAndUpdate(
    user?._id,
    {
      $set: {
        verification: {
          otp,
          expiresAt,
          status: false,
        },
        // This OTP goes to the stored number, so verify must claim that one
        pendingPhoneNumber: null,
      },
    },
    { returnDocument: 'after' },
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

  // === Mock mode test ===
  const isDevelopment = config.node_env !== 'production'

  if (isDevelopment) {
    console.log('🔑 [MOCK OTP] Phone:', phoneNumber)
    console.log('🔑 [MOCK OTP] Code:', otp)
    console.log(
      '🔑 [MOCK OTP] Expires at:',
      expiresAt.format('YYYY-MM-DD HH:mm:ss'),
    )
    console.log('⚠️  Real SMS skipped in development mode')

    // FOR TESTING PURPOSES: Returning OTP (remove in production)
    return {
      token,
      otp,
      mock: true,
    }
  }

  // === Production mode: Twilio SMS ===
  const client = twilio(config.twilio.accountSid, config.twilio.authToken)

  try {
    const res = await client.messages.create({
      body: `Welcome to Consultz. Your verification code is ${otp}. It expires in 5 minutes. Please do not share this code.`,
      from: config.twilio.phoneNumber,
      to: phoneNumber,
    })
    console.log('[Twilio SMS Success][sendOtpViaDirectPhone]', {
      phoneNumber,
      sid: res?.sid,
      status: res?.status,
    })

    return {
      token,
    }
  } catch (error: any) {
    logTwilioSmsError('sendOtpViaDirectPhone', phoneNumber, error)

    if (error.code === 21612) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This country code is currently not supported for OTP. Please try another number or contact support.',
      )
    }

    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send OTP')
  }
}

export const otpServices = {
  changeSignupEmail,
  verifyWithEmail,
  verifyWithPhoneNumber,
  sendOtpInEmail,
  sendOtpViaTokenInPhone,
  sendOtpViaDirectPhone,
}
