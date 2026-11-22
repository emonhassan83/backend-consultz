import httpStatus from 'http-status'
import { ClientSession, Types } from 'mongoose'
import { Follow } from '../connection/connection.models'
import { modeType } from '../notification/notification.interface'
import { messages } from '../notification/notification.constant'
import { TUser } from './user.interface'
import { findAdmin } from '../../utils/findAdmin'
import { sendNotification } from '../../utils/sentNotification'
import {
  INTRO_VIDEO_MAX_MB,
  INTRO_VIDEO_MAX_SECONDS,
  INTRO_VIDEO_MIME_TYPES,
  MAX_AGE,
  MIN_AGE,
  PROFILE_PROTECTED_FIELDS,
  REGISTER_WITH,
  TUserStatus,
  USER_ROLE,
  USER_STATUS,
} from './user.constant'
import emailSender from '../../utils/emailSender'
import config from '../../config'
import { BOOKING_STATUS } from '../booking/booking.constants'
import { Booking } from '../booking/booking.models'
import { User } from './user.model'
import AppError from '../../errors/AppError'
import { Feed } from '../feed/feed.model'
import { ContentMeta } from '../contentMeta/contentMeta.model'
import { Comments } from '../comments/comments.models'
import { Reply } from '../reply/reply.models'
import { Report } from '../report/report.models'
import { Appeal } from '../appeal/appeal.model'
import { Withdraw } from '../withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'
import { BlockProfile } from '../blockProfile/blockProfile.models'
import { Reviews } from '../review/review.models'
import { Notification } from '../notification/notification.model'
import { PointsLog } from '../pointsLogs/pointsLogs.model'
import {
  normalizePhone,
  PHONE_ALREADY_EXISTS_MESSAGE,
} from '../../utils/normalizePhone'
import { emailCaseInsensitiveFilter } from '../../utils/normalizeEmail'
import { escapeHtml, truncate } from '../report/report.helpers'

/**
 * Another live, completed account (email or phone verified) that owns this
 * phone number (QA #12). Unverified sign-ups don't own their number, so a
 * user who typed a wrong number can't lock someone else out. The raw trimmed
 * value is also matched for numbers stored before normalization.
 */
export const findPhoneOwner = async (
  phone: string | null | undefined,
  excludeUserId?: string | Types.ObjectId | null,
  session?: ClientSession,
) => {
  const normalized = normalizePhone(phone)
  if (!normalized) return null

  const candidates = Array.from(new Set([normalized, (phone ?? '').trim()]))

  return User.findOne({
    phoneNumber: { $in: candidates },
    isDeleted: false,
    $or: [{ isPhoneOtpVerified: true }, { isEmailVerified: true }],
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  })
    .select('_id')
    .session(session ?? null)
}

export type TReferralApplyAction =
  | { action: 'apply' }
  | { action: 'noop' }
  | { action: 'error'; message: string }

/**
 * What to do when a referral code is applied to a user (#14, #16). Codes are
 * reusable across users; each user can join with one referrer. Applying the
 * same referrer again (e.g. register body + use-referral-code) is a no-op,
 * not an error.
 */
export const getReferralApplyAction = (params: {
  userId: string | Types.ObjectId
  currentReferredBy?: string | Types.ObjectId | null
  referrerId: string | Types.ObjectId
  replaceExisting?: boolean
}): TReferralApplyAction => {
  const userId = String(params.userId)
  const referrerId = String(params.referrerId)
  const current = params.currentReferredBy
    ? String(params.currentReferredBy)
    : null

  if (referrerId === userId) {
    return { action: 'error', message: 'Cannot use your own referral code' }
  }
  if (current === referrerId) {
    return { action: 'noop' }
  }
  if (current && !params.replaceExisting) {
    return {
      action: 'error',
      message: 'You have already joined with a different referral code',
    }
  }
  return { action: 'apply' }
}

/** Google/Apple accounts sign in through the provider and have no Consultz password. */
export const isSocialAccount = (registerWith?: string | null): boolean =>
  registerWith === REGISTER_WITH.google || registerWith === REGISTER_WITH.apple

/** Message for a social user who tries to change a password they don't have (#23). */
export const getSocialPasswordMessage = (registerWith?: string | null) => {
  const isApple = registerWith === REGISTER_WITH.apple
  const provider = isApple ? 'Apple' : 'Google'
  const settings = isApple ? 'Apple ID settings' : 'Google Account settings'
  return `You sign in with ${provider}. There's no separate Consultz password. To change your password, go to your ${settings}.`
}

/** Login / forgot-password message for a Google/Apple account (#25). */
export const getSocialSignInMessage = (registerWith?: string | null) => {
  const provider = registerWith === REGISTER_WITH.apple ? 'Apple' : 'Google'
  return `This email is linked to ${provider} sign-in. Please sign in with ${provider} instead.`
}

/**
 * Why an email change request can't go ahead, or null if it can (#26).
 * Both emails must already be normalized.
 */
export const getEmailChangeError = (params: {
  registerWith?: string | null
  currentEmail: string
  newEmail: string
  // An unverified email may be "changed" to itself, which just verifies it (#65)
  isEmailVerified?: boolean | null
}): string | null => {
  if (isSocialAccount(params.registerWith)) {
    const provider = params.registerWith === REGISTER_WITH.apple ? 'Apple' : 'Google'
    return `Your email comes from your ${provider} sign-in and can't be changed here.`
  }
  if (!params.newEmail) return 'Please enter a valid email address.'
  if (params.newEmail === params.currentEmail && params.isEmailVerified !== false) {
    return 'This is already your email address.'
  }
  return null
}

/**
 * Why an admin can't set this email on the user, or null if they can (#67).
 * Both emails must already be normalized.
 */
export const getAdminEmailChangeError = (params: {
  registerWith?: string | null
  currentEmail: string
  newEmail: string
}): string | null => {
  if (isSocialAccount(params.registerWith)) {
    const provider = params.registerWith === REGISTER_WITH.apple ? 'Apple' : 'Google'
    return `This user signs in with ${provider}, so their email comes from ${provider} and can't be changed here.`
  }
  if (!params.newEmail) return 'Please enter a valid email address.'
  if (params.newEmail === params.currentEmail) {
    return "This is already the user's email address."
  }
  return null
}

/**
 * Why the email of a sign-up still waiting for its OTP can't be corrected,
 * or null if it can (#65). Both emails must already be normalized.
 */
export const getSignupEmailChangeError = (params: {
  registerWith?: string | null
  isEmailVerified?: boolean | null
  isPhoneOtpVerified?: boolean | null
  currentEmail: string
  newEmail: string
}): string | null => {
  if (
    isSocialAccount(params.registerWith) ||
    params.isEmailVerified ||
    params.isPhoneOtpVerified
  ) {
    return 'Your account is already verified. Change your email from Settings.'
  }
  if (!params.newEmail) return 'Please enter a valid email address.'
  if (params.newEmail === params.currentEmail) {
    return 'This is already the email for this sign-up.'
  }
  return null
}

/** Throws 409 if any other account (deleted ones too: the email index is unique) has this email. */
export const assertEmailAvailable = async (
  email: string,
  userId: string | Types.ObjectId,
) => {
  const taken = await User.exists({
    ...emailCaseInsensitiveFilter(email),
    _id: { $ne: userId },
  })
  if (taken) {
    throw new AppError(httpStatus.CONFLICT, 'This email is already in use.')
  }
}

/** Why this file can't be an intro video, or null if it can (#31). */
export const getIntroVideoFileError = (mimetype?: string | null): string | null => {
  if (!mimetype || !INTRO_VIDEO_MIME_TYPES.includes(mimetype.toLowerCase())) {
    return 'Intro video must be an MP4, MOV or WebM file.'
  }
  return null
}

export const INTRO_VIDEO_TOO_LARGE_MESSAGE = `Video is too large. The maximum size is ${INTRO_VIDEO_MAX_MB} MB (about ${INTRO_VIDEO_MAX_SECONDS / 60} minutes). Please choose a shorter video.`

export const getIntroVideoExtension = (mimetype: string): string => {
  switch (mimetype.toLowerCase()) {
    case 'video/quicktime':
      return 'mov'
    case 'video/webm':
      return 'webm'
    default:
      return 'mp4'
  }
}

/**
 * The S3 object key for a URL that uploadToS3 returned (`<s3BaseUrl>/<key>`),
 * or null when the URL isn't under that base.
 */
export const getS3KeyFromUrl = (
  url?: string | null,
  baseUrl?: string | null,
): string | null => {
  if (!url || !baseUrl) return null
  const base = baseUrl.replace(/\/+$/, '') + '/'
  if (!url.startsWith(base)) return null
  const key = decodeURIComponent(url.slice(base.length).split(/[?#]/)[0])
  return key || null
}

/** One warning entry for User.warnings (#70). */
export const buildWarningEntry = (params: {
  reason?: string | null
  source: 'post' | 'admin'
  feedId?: string | Types.ObjectId | null
  adminId?: string | Types.ObjectId | null
  now?: Date
}) => ({
  reason: truncate(params.reason || '', 500),
  source: params.source,
  feed: params.feedId ? new Types.ObjectId(String(params.feedId)) : null,
  issuedBy: params.adminId ? new Types.ObjectId(String(params.adminId)) : null,
  createdAt: params.now ?? new Date(),
})

/**
 * Records a warning against the account (#70): history entry, count, date,
 * and status "warning". Returns the updated user.
 */
export const recordUserWarning = async (
  params: Parameters<typeof buildWarningEntry>[0] & {
    userId: string | Types.ObjectId
    session?: ClientSession
  },
) => {
  const entry = buildWarningEntry(params)
  return User.findByIdAndUpdate(
    params.userId,
    {
      $push: { warnings: entry },
      $inc: { warningCount: 1 },
      $set: { lastWarnedAt: entry.createdAt, status: USER_STATUS.warning },
    },
    { returnDocument: 'after', session: params.session },
  )
}

/** Copy for the account-warning notification and email (#70). Reason is HTML-escaped in html. */
export const getWarningCopy = (reason?: string | null) => {
  const plainReason = (reason || '').trim() || 'Not provided'
  return {
    subject: 'Your Consultz account has received a warning',
    message: 'Account warning issued.',
    description: `Our team has issued a warning on your account. Reason: ${truncate(plainReason, 200)}. Please review our community guidelines; repeated issues may lead to suspension.`,
    reasonHtml: escapeHtml(plainReason),
  }
}

export const ONBOARDING_FIELDS =
  'registerWith isPhoneOtpVerified phoneNumber dob termsAcceptedAt'

/**
 * Social (Google/Apple) users skip the credentials sign-up steps, so they must
 * finish onboarding: verified phone, date of birth and accepted terms (#13).
 * Credentials users give phone and dob at register and verify by email, so
 * this is always false for them.
 */
export const getNeedsOnboarding = (
  user?: Partial<
    Pick<
      TUser,
      | 'registerWith'
      | 'isPhoneOtpVerified'
      | 'phoneNumber'
      | 'dob'
      | 'termsAcceptedAt'
    >
  > | null,
): boolean => {
  if (!user) return false
  if (!isSocialAccount(user.registerWith)) return false

  return (
    !user.isPhoneOtpVerified ||
    !user.phoneNumber ||
    !user.dob ||
    !user.termsAcceptedAt
  )
}

/** Throws 409 if another completed account already owns this phone number. */
export const assertPhoneAvailable = async (
  phone: string | null | undefined,
  excludeUserId?: string | Types.ObjectId | null,
  session?: ClientSession,
) => {
  const owner = await findPhoneOwner(phone, excludeUserId, session)
  if (owner) {
    throw new AppError(httpStatus.CONFLICT, PHONE_ALREADY_EXISTS_MESSAGE)
  }
}

const DOB_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Age in full years from a `YYYY-MM-DD` date of birth (the zod `z.iso.date()`
 * format), compared against today's date in UTC. Returns null if the date is
 * not a real calendar date (e.g. 2001-02-30).
 */
export const getAgeFromDob = (dob: string, now: Date = new Date()) => {
  const match = DOB_FORMAT.exec(dob ?? '')
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  const nowMonth = now.getUTCMonth() + 1
  const nowDay = now.getUTCDate()
  let age = now.getUTCFullYear() - year
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age--
  return age
}

/** Returns a user-facing error message, or null when the dob is acceptable. */
export const getDobError = (dob: string, now: Date = new Date()) => {
  const age = getAgeFromDob(dob, now)
  if (age === null) {
    return 'Date of birth must be a valid date in YYYY-MM-DD format'
  }
  const today = now.toISOString().slice(0, 10)
  if (dob > today) {
    return 'Date of birth cannot be in the future'
  }
  if (age < MIN_AGE) {
    return `You must be at least ${MIN_AGE} years old to use Consultz`
  }
  if (age > MAX_AGE) {
    return 'Please enter a valid date of birth'
  }
  return null
}

const ACTIVE_BOOKING_STATUSES_FOR_PROFILE_DELETE = [
  BOOKING_STATUS.pending,
  BOOKING_STATUS.confirmed,
  BOOKING_STATUS.running,
]

const PENDING_WITHDRAW_STATUSES = [
  WITHDRAW_STATUS.proceed,
  WITHDRAW_STATUS.hold,
]

export const getCancellationRates = (
  lifetimeTotal: number,
  lifetimeCancelled: number,
  last90DaysTotal: number,
  last90DaysCancelled: number,
) => {
  const toRate = (total: number, cancelled: number) =>
    total > 0 ? Math.min(Math.round((cancelled / total) * 100), 100) : 0

  return {
    cancellationRate: toRate(lifetimeTotal, lifetimeCancelled),
    cancellationRateLast90Days: toRate(last90DaysTotal, last90DaysCancelled),
  }
}

export const calculateProfileSetupProgress = (user: any): number => {
  if (!user || !user.role) {
    return 0
  }

  let requiredFields: string[] = []

  // Required fields for 'consult' role
  if (user.role === USER_ROLE.consult) {
    requiredFields = [
      'firstName',
      'lastName',
      'email',
      'password',
      'dob',
      'photoUrl',
      'coverPhoto',
      'phoneNumber',
      'timeZone',
      'priceRange',
      'interests',
      'learningStyles',
      'availability',
    ]
  } else {
    // Required fields for 'tutor' or other roles
    requiredFields = [
      'firstName',
      'lastName',
      'email',
      'password',
      'dob',
      'photoUrl',
      'coverPhoto',
      'phoneNumber',
      'socialProfiles',
      'hourlyRate',
      'expertise',
      'skills',
      'advisingStyles',
      'bio',
      'timeZone',
      'sessionDurations',
      'availability',
    ]
  }

  if (requiredFields.length === 0) {
    return 0
  }

  // Count how many fields are "filled"
  const filledCount = requiredFields.filter((field) => {
    const value = user[field]

    if (value === null || value === undefined) return false

    if (typeof value === 'string') {
      return value.trim().length > 0
    }

    if (Array.isArray(value)) {
      return value.length > 0
    }

    if (typeof value === 'number') {
      return value > 0
    }

    // Any other truthy value
    return !!value
  }).length

  // Calculate percentage and cap at 100
  const progress = Math.round((filledCount / requiredFields.length) * 100)
  return Math.min(progress, 100)
}

/**
 * Batch checks if current user follows multiple target users
 * @returns Map<targetUserId: string, isFollowing: boolean>
 */
export const getFollowingStatusBatch = async (
  currentUserId: string,
  targetUserIds: string[] | Types.ObjectId[]
): Promise<Map<string, boolean>> => {
  if (!currentUserId || targetUserIds.length === 0) return new Map();

  const normalizedIds = targetUserIds.map(id => new Types.ObjectId(id.toString()));

  const follows = await Follow.find({
    follower: new Types.ObjectId(currentUserId),
    following: { $in: normalizedIds },
  })
    .select('following')
    .lean();

  const followingSet = new Set(follows.map(f => f.following.toString()));

  const result = new Map<string, boolean>();
  normalizedIds.forEach(id => {
    result.set(id.toString(), followingSet.has(id.toString()));
  });

  return result;
};

/**
 * Batch calculates total completed bookings for multiple experts
 * @returns Map<expertId: string, totalBookings: number>
 */
export const getTotalBookingsBatch = async (
  expertIds: string[] | Types.ObjectId[]
): Promise<Map<string, number>> => {
  if (expertIds.length === 0) return new Map();

  const normalizedIds = expertIds.map(id => new Types.ObjectId(id.toString()));

  const completedCounts = await Booking.aggregate([
    {
      $match: {
        consult: { $in: normalizedIds },
        status: BOOKING_STATUS.completed,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$consult',
        totalBookings: { $sum: 1 },
      },
    },
  ]);

  const countMap = new Map(completedCounts.map(c => [c._id.toString(), c.totalBookings]));
  return countMap;
};

export const sendUserStatusNotifYToAdmin = async (
  status: 'active' | 'blocked' | 'pending' | 'warning',
  user: TUser,
) => {
  const admin = await findAdmin()
  if (!admin || !admin?.fcmToken) return

  let message = ''
  let description = ''

  if (status === 'active') {
    message = messages.userManagement.accountActivated
    description = `User ${user?.firstName} (ID: ${user?.id}) has been successfully activated.`
  } else {
    message = messages.userManagement.accountDeactivated
    description = `User ${user?.firstName} (ID: ${user?.id}) has been blocked from accessing the system.`
  }

  const notifyPayload = {
    receiver: admin._id,
    message,
    description,
    reference: user._id,
    modelType: modeType.User,
  }

  await sendNotification([admin.fcmToken], notifyPayload)
}

export const sendUserStatusNotifYToUser = async (
  status: 'active' | 'blocked' | 'pending' | 'warning',
  user: TUser,
) => {
  if (!user || !user?.fcmToken) return

  let message
  let description

  if (status === 'active') {
    message = messages.userManagement.accountActivated
    description = `Your account has been successfully activated. You can now access all available features.`
  } else {
    message = messages.userManagement.accountDeactivated
    description = `Your account has been blocked. Please contact support for further assistance.`
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: user._id,
    modelType: modeType.User,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}

export const generateUserStatusEmail = async (
  user: TUser,
  status: TUserStatus,
) => {
  const supportEmail = config.emailSender.email

  if (status === USER_STATUS.blocked) {
    await emailSender(
      user?.email,
      'Your Consultz Account Has Been Blocked',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #333;">Account Blocked Notification</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Dear <strong>${user.firstName}</strong>,
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          We regret to inform you that your Consultz account has been <strong>temporarily blocked</strong> by our admin team.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          If you believe this action was taken in error or would like to appeal, please contact our support team immediately at 
          <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for your understanding.<br>
          Consultz Support Team
        </p>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #777;">
          © ${new Date().getFullYear()} Consultz. All rights reserved.<br>
        </div>
      </div>
    `,
    )
  }
  if (status === USER_STATUS.active) {
    await emailSender(
      user?.email,
      'Your Consultz Account Has Been Reactivated',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #333; text-align: center;">Account Reactivated</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Dear <strong>${user.firstName}</strong>,
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Great news! Your Consultz account has been successfully <strong>reactivated</strong> by our team.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          You can now log in and continue using all features of the platform.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          If you have any questions or need assistance, feel free to contact us at 
          <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for being part of Consultz.<br>
          Consultz Support Team
        </p>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #777;">
          © ${new Date().getFullYear()} Consultz. All rights reserved.<br>
        </div>
      </div>
        `,
    )
  }
}

export const sendWarningEmail = async (user: TUser, reason?: string | null) => {
  if (!user?.email) return
  const supportEmail = config.emailSender.email
  const copy = getWarningCopy(reason)
  await emailSender(
    user.email,
    copy.subject,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #333;">Account Warning</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Dear <strong>${escapeHtml(user.firstName)}</strong>,</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Our team has issued a <strong>warning</strong> on your Consultz account.</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;"><strong>Reason:</strong> ${copy.reasonHtml}</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Please review our community guidelines. Repeated issues may lead to your account being suspended.</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">If you think this is a mistake, contact us at <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.</p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">Consultz Support Team</p>
      </div>
    `,
  )
}

export const sendExpertPendingEmail = async (user: TUser) => {
  const supportEmail = config.emailSender.email

  await emailSender(
    user?.email,
    'Your Consultz Account Has Been Pending Approval',
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #555;">Your Profile is Under Review</h2>
      <p style="color: #555; margin-top: 10px;">Dear ${user.firstName},</p>
      <p style="color: #555;">Thank you for completing your registration as an Expert on Consultz.</p>
      <p style="color: #555;">Your profile is now in <strong>pending</strong> status. Our admin team is reviewing your details and will approve it shortly.</p>
      <p style="color: #555;">Once approved, you will be able to start accepting bookings and providing consultations.</p>
      <p style="color: #555;">You will receive another email notification when your account is activated.</p>
      <p style="color: #555;">If you have any questions in the meantime, feel free to contact us at 
         <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.
      </p>
      <p style="color: #555;">Thank you for joining Consultz,<br/>Consultz Team</p>
      <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} Consultz. All rights reserved.
      </div>
    </div>
  `,
  )
}


export const assertUserCanDeleteProfile = async (userId: string) => {
  const userObjectId = new Types.ObjectId(userId)

  const [activeBooking, pendingWithdraw] = await Promise.all([
    Booking.exists({
      isDeleted: false,
      status: { $in: ACTIVE_BOOKING_STATUSES_FOR_PROFILE_DELETE },
      $or: [{ user: userObjectId }, { consult: userObjectId }],
    }),
    Withdraw.exists({
      user: userObjectId,
      isDeleted: false,
      status: { $in: PENDING_WITHDRAW_STATUSES },
    }),
  ])

  if (activeBooking) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot delete profile while active bookings exist',
    )
  }

  if (pendingWithdraw) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot delete profile while pending withdrawals exist',
    )
  }
}

export const removeUserContentData = async (
  userId: string,
  session: ClientSession,
) => {
  const userObjectId = new Types.ObjectId(userId)

  const feeds = await Feed.find({ author: userObjectId })
    .select('_id contentMeta')
    .session(session)
  const feedIds = feeds.map((feed) => feed._id)
  const contentMetaIds = feeds
    .map((feed) => feed.contentMeta?.toString())
    .filter((contentMetaId): contentMetaId is string => Boolean(contentMetaId))

  if (feedIds.length > 0) {
    const feedComments = await Comments.find({ content: { $in: feedIds } })
      .select('_id')
      .session(session)
    const feedCommentIds = feedComments.map((comment) => comment._id)

    await Promise.all([
      feedCommentIds.length > 0
        ? Reply.deleteMany({ replyRef: { $in: feedCommentIds } }).session(
            session,
          )
        : Promise.resolve(),
      Comments.deleteMany({ content: { $in: feedIds } }).session(session),
      Report.deleteMany({ feed: { $in: feedIds } }).session(session),
      Appeal.deleteMany({ feed: { $in: feedIds } }).session(session),
      Feed.deleteMany({ _id: { $in: feedIds } }).session(session),
    ])
  }

  if (contentMetaIds.length > 0) {
    await ContentMeta.deleteMany({ _id: { $in: contentMetaIds } }).session(
      session,
    )
  }

  const userCommentsFilter: Record<string, unknown> = { user: userObjectId }
  if (feedIds.length > 0) {
    userCommentsFilter.content = { $nin: feedIds }
  }

  const userCommentsOnOthers = await Comments.find(userCommentsFilter).session(
    session,
  )

  for (const comment of userCommentsOnOthers) {
    const replyCount = await Reply.countDocuments({
      replyRef: comment._id,
    }).session(session)

    await Reply.deleteMany({ replyRef: comment._id }).session(session)
    await ContentMeta.updateOne(
      { content: comment.content },
      { $inc: { comment: -(1 + replyCount) } },
      { session },
    )
  }

  if (userCommentsOnOthers.length > 0) {
    await Comments.deleteMany({
      _id: { $in: userCommentsOnOthers.map((comment) => comment._id) },
    }).session(session)
  }

  const userReplies = await Reply.find({ user: userObjectId }).session(session)

  for (const reply of userReplies) {
    if (!reply.replyRef) {
      continue
    }

    const parentComment = await Comments.findById(reply.replyRef).session(
      session,
    )
    if (!parentComment) {
      continue
    }

    await Comments.updateOne(
      { _id: parentComment._id },
      { $pull: { reply: reply._id } },
      { session },
    )
    await ContentMeta.updateOne(
      { content: parentComment.content },
      { $inc: { comment: -1 } },
      { session },
    )
  }

  if (userReplies.length > 0) {
    await Reply.deleteMany({ user: userObjectId }).session(session)
  }

  await Promise.all([
    Report.deleteMany({
      $or: [{ author: userObjectId }, { feedAuthor: userObjectId }],
    }).session(session),
    Appeal.deleteMany({ user: userObjectId }).session(session),
  ])

  const likedContentMetas = await ContentMeta.find({
    likeBy: userId,
  }).session(session)

  for (const contentMeta of likedContentMetas) {
    const hasLiked = contentMeta.likeBy?.some(
      (likedById) => likedById.toString() === userId,
    )

    if (!hasLiked) {
      continue
    }

    await ContentMeta.updateOne(
      { _id: contentMeta._id },
      {
        $pull: { likeBy: userId },
        $inc: { like: -1 },
      },
      { session },
    )
  }

  await Promise.all([
    Follow.deleteMany({
      $or: [{ follower: userObjectId }, { following: userObjectId }],
    }).session(session),
    BlockProfile.deleteMany({
      $or: [{ blocker: userObjectId }, { blocked: userObjectId }],
    }).session(session),
    Reviews.deleteMany({
      $or: [{ user: userObjectId }, { expert: userObjectId }],
    }).session(session),
    Notification.deleteMany({ receiver: userObjectId }).session(session),
    PointsLog.deleteMany({ user: userObjectId }).session(session),
  ])
}

export const sendSlotRegenerationNotification = async (expertId: string) => {
  const expert = await User.findById(expertId);
  if (!expert?.fcmToken) return;

  await sendNotification([expert.fcmToken], {
    receiver: expert._id,
    message: 'Availability Updated',
    description: 'Your availability has been updated. New booking times will be generated dynamically.',
    modelType: modeType.User,
  });
};

const PROTECTED_PROFILE_KEYS = new Set<string>(PROFILE_PROTECTED_FIELDS)

/**
 * Removes fields update-profile must never set (role, points, status, ...),
 * plus Mongo operator / dotted keys. Phase 0 security: before this, any
 * logged-in user could send {"role":"admin"} and become an admin.
 */
export const stripProtectedProfileFields = <T extends Record<string, any>>(
  payload: T | null | undefined,
): Partial<T> => {
  const clean: Record<string, any> = {}
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (PROTECTED_PROFILE_KEYS.has(key)) continue
    if (key.startsWith('$') || key.includes('.')) continue
    clean[key] = value
  }
  return clean as Partial<T>
}
