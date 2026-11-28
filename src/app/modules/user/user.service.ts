import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TUser } from './user.interface'
import { User } from './user.model'
import QueryBuilder from '../../builder/QueryBuilder'
import {
  INVESTMENT_SKILLS,
  PROPERTY_SKILLS,
  REGISTER_WITH,
  TUserStatus,
  USER_ROLE,
  USER_STATUS,
} from './user.constant'
import {
  assertPhoneAvailable,
  assertUserCanDeleteProfile,
  calculateProfileSetupProgress,
  generateUserStatusEmail,
  getFollowingStatusBatch,
  getCancellationRates,
  getDobError,
  stripProtectedProfileFields,
  getEmailChangeError,
  getAdminEmailChangeError,
  recordUserWarning,
  getWarningCopy,
  sendWarningEmail,
  assertEmailAvailable,
  getNeedsOnboarding,
  getReferralApplyAction,
  getTotalBookingsBatch,
  ONBOARDING_FIELDS,
  removeUserContentData,
  sendUserStatusNotifYToAdmin,
} from './user.utils'
import mongoose, { QueryFilter, Types } from 'mongoose'
import { Booking } from '../booking/booking.models'
import { BOOKING_NO_SHOW_BY, BOOKING_STATUS, PAYMENT_STATUS } from '../booking/booking.constants'
import { validateVatNumber } from '../../utils/vatValidation'
import { getVatRateForCountry } from '../../utils/vatRate'
import { sendNotification } from '../../utils/sentNotification'
import { Follow } from '../connection/connection.models'
import { ProfileView } from '../profileView/profileView.model'
import { Withdraw } from '../withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'
import { modeType } from '../notification/notification.interface'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import {
  buildBufferRulesFromSlotBufferStep,
  getDefaultBookingRules,
} from '../booking/bookingRules.utils'
import { PointsLogsService } from '../pointsLogs/pointsLogs.service'
import {
  POINTS_LOG_SOURCE,
  POINTS_LOG_TYPE,
  TPointsLogType,
} from '../pointsLogs/pointsLogs.constant'
import { PointsService } from '../points/points.service'
import { POINTS_REWARD_KEY } from '../points/points.constant'
import { getLast90DaysPointsByUsers } from '../points/points.utils'
import {
  emailCaseInsensitiveFilter,
  normalizeEmail,
} from '../../utils/normalizeEmail'
import { getPhoneError, normalizePhone } from '../../utils/normalizePhone'
import { escapeHtml } from '../report/report.helpers'
import moment from 'moment'
import config from '../../config'
import emailSender from '../../utils/emailSender'
import { generateOtp } from '../../utils/generateOtp'
import { generateTokens } from '../auth/auth.utils'
import { deleteFromS3, uploadToS3 } from '../../utils/s3'
import { withSessionPrices } from '../../utils/sessionPrice'
import { notifyUserInApp } from '../../utils/notifyInApp'
import {
  getIntroVideoExtension,
  getIntroVideoFileError,
  getS3KeyFromUrl,
} from './user.utils'

const withLast90DaysRanking = async <T extends { _id: any; createdAt?: Date; avgRating?: number }>(
  experts: T[],
) => {
  const map = await getLast90DaysPointsByUsers(experts.map((e) => e._id))
  const thirtyDaysAgo = dayjs().subtract(30, 'day')

  return [...experts]
    .map((expert) => {
      const recent = map.get(String(expert._id)) || 0
      const isNewExpert =
        expert.createdAt && dayjs(expert.createdAt).isAfter(thirtyDaysAgo)
      const rankingPoints = isNewExpert ? Math.max(recent, 1) : recent
      return {
        ...expert,
        last90DaysPoints: recent,
        rankingPoints,
      }
    })
    .sort((a, b) => {
      if (b.rankingPoints !== a.rankingPoints) {
        return b.rankingPoints - a.rankingPoints
      }
      return Number(b.avgRating || 0) - Number(a.avgRating || 0)
    })
}
dayjs.extend(utc)

const createPointsLog = async (
  userId: Types.ObjectId | string,
  points: number,
  reason: string,
  source: keyof typeof POINTS_LOG_SOURCE = POINTS_LOG_SOURCE.reword,
  type: TPointsLogType = POINTS_LOG_TYPE.credit,
  session?: mongoose.ClientSession,
) => {
  await PointsLogsService.createPointsLog(
    {
      user:
        typeof userId === 'string'
          ? new Types.ObjectId(userId)
          : userId,
      type,
      points,
      reason,
      source,
    },
    session,
  )
}

const applyReferralCodeToUser = async (
  userId: string,
  referralCode: string,
  options?: { replaceExisting?: boolean },
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const user = await User.findById(userId).session(session)
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    // Deleted users' codes are not valid (#16)
    const referrer = await User.findOne({
      referralCode,
      isDeleted: false,
    }).session(session)
    if (!referrer) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid referral code')
    }

    const decision = getReferralApplyAction({
      userId: user._id,
      currentReferredBy: user.referredBy,
      referrerId: referrer._id,
      replaceExisting: options?.replaceExisting,
    })
    if (decision.action === 'error') {
      throw new AppError(httpStatus.BAD_REQUEST, decision.message)
    }

    // Same referrer again (register body + use-referral-code): nothing to do (#16)
    if (decision.action === 'apply') {
      user.referredBy = referrer._id
      user.pendingReferralReward = true
      await user.save({ session })
    }
    await session.commitTransaction()

    return {
      _id: user._id,
      referredBy: user.referredBy,
      points: user.points,
      pendingReferralReward: Boolean(user.pendingReferralReward),
      referrer: {
        _id: referrer._id,
        firstName: referrer.firstName,
        lastName: referrer.lastName,
      },
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const registerUserIntoDB = async (
  payload: TUser & { referralCode?: string; expertRef?: string },
) => {
  const { password, referralCode, expertRef, ...rest } = payload
  const email = normalizeEmail(payload.email)
  const phoneNumber = normalizePhone(payload.phoneNumber)
  const userPayload = { ...rest, email, password, phoneNumber }
  const applyReferralAndReturnUser = async (
    userId: string,
    options?: { replaceExisting?: boolean },
  ) => {
    if (expertRef) {
      await PointsService.applyExpertRefOnRegister(userId, expertRef)
    }
    if (!referralCode) {
      return expertRef ? await User.findById(userId) : null
    }

    await applyReferralCodeToUser(userId, referralCode, options)
    const updatedUser = await User.findById(userId)
    if (!updatedUser) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }
    return updatedUser
  }

  if (payload.role === USER_ROLE.admin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You cannot directly assign admin role',
    )
  }

  // Case-insensitive so `Test@x.com` is caught when `test@x.com` exists (#4)
  const existingUser =
    (await User.findOne({ email })) ??
    (await User.findOne(emailCaseInsensitiveFilter(email)))
  const isCompletedAccount =
    !!existingUser &&
    !existingUser.isDeleted &&
    ((existingUser.registerWith &&
      existingUser.registerWith !== REGISTER_WITH.credentials) ||
      existingUser.isEmailVerified ||
      existingUser.isPhoneOtpVerified)

  // Duplicate phone (#12): checked before any write. The email 409 below
  // keeps priority, and the user's own record is excluded so an incomplete
  // sign-up can be resumed with the same number.
  if (!isCompletedAccount) {
    await assertPhoneAvailable(phoneNumber, existingUser?._id)
  }

  if (existingUser) {
    // Soft deleted user — recreate
    if (existingUser.isDeleted) {
      existingUser.set({
        ...userPayload,
        isDeleted: false,
        isEmailVerified: false,
        isPhoneOtpVerified: false,
        pendingReferralReward: false,
        attributedExpert: null,
        attributedAt: null,
      })
      existingUser.set('referredBy', undefined)
      const user = await existingUser.save()
      const updatedUser = await applyReferralAndReturnUser(user._id.toString(), {
        replaceExisting: true,
      })
      if (updatedUser) return updatedUser
      return user
    }

    // Completed account (social sign-in, or email / legacy phone verified) —
    // never overwrite it from the register endpoint.
    if (isCompletedAccount) {
      throw new AppError(
        httpStatus.CONFLICT,
        'An account with this email already exists. Please log in or reset your password.',
      )
    }

    // Incomplete credentials sign-up (email OTP never verified) — resume it.
    // Referral is replaced, not re-applied: nothing is rewarded before the
    // first paid session, so this is safe and avoids "Referral code already used".
    existingUser.set({
      ...userPayload,
      expireAt: dayjs().add(60, 'minute').toDate(),
    })
    const user = await existingUser.save()
    const updatedUser = await applyReferralAndReturnUser(user._id.toString(), {
      replaceExisting: true,
    })
    if (updatedUser) return updatedUser
    return user
  }

  if (!payload.password) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password is required')
  }

  if (referralCode) {
    const referrer = await User.findOne({
      referralCode,
      isDeleted: false,
    }).select('_id')
    if (!referrer) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid referral code')
    }
  }

  const finalPayload = {
    ...userPayload,
    status: USER_STATUS.active,
  }

  const newUser = await User.create(finalPayload)

  const updatedUser = await applyReferralAndReturnUser(newUser._id.toString())
  if (updatedUser) return updatedUser

  return newUser
}

// Social sign-up onboarding (#13): date of birth (18+) and terms.
// Phone is verified separately through send-otp-via-token-in-phone.
const completeOnboardingIntoDB = async (
  userId: string,
  payload: { dob?: string; termsAccepted: true },
) => {
  const user = await User.findById(userId).select(
    `isDeleted ${ONBOARDING_FIELDS}`,
  )
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const update: Record<string, unknown> = { termsAcceptedAt: new Date() }

  if (user.dob) {
    // dob can't be changed through onboarding once it is set
    if (payload.dob && payload.dob !== user.dob) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Date of birth is already set and cannot be changed here',
      )
    }
  } else {
    if (!payload.dob) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Date of birth is required')
    }
    const dobError = getDobError(payload.dob)
    if (dobError) {
      throw new AppError(httpStatus.BAD_REQUEST, dobError)
    }
    update.dob = payload.dob
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { returnDocument: 'after' },
  ).select(`_id email role ${ONBOARDING_FIELDS}`)

  if (!updatedUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  return {
    _id: updatedUser._id,
    dob: updatedUser.dob,
    termsAcceptedAt: updatedUser.termsAcceptedAt,
    phoneNumber: updatedUser.phoneNumber,
    isPhoneOtpVerified: updatedUser.isPhoneOtpVerified,
    needsOnboarding: getNeedsOnboarding(updatedUser),
  }
}

const getAllUsersFromDB = async (
  query: Record<string, unknown>,
  currentUserId: string,
  options?: { includeDob?: boolean },
) => {
  // Base filter — সবসময় apply হবে
  const mustMatch: QueryFilter<TUser> = {
    isDeleted: false,
    role: { $ne: USER_ROLE.admin },
  }

  // Optional conditions — যেকোনো একটা match করলেই চলবে
  const orConditions: QueryFilter<TUser>[] = []

  if (query.priceRange) {
    const [minStr, maxStr] = (query.priceRange as string).split('-')
    const min = Number(minStr)
    const max = Number(maxStr)
    if (!isNaN(min) && !isNaN(max)) {
      orConditions.push({ hourlyRate: { $gte: min, $lte: max } })
    }
    delete query.priceRange
  }

  if (query.interests) {
    const interests = (query.interests as string)
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean)
    if (interests.length > 0) {
      orConditions.push({ expertise: { $in: interests } }) // ← was interests
    }
    delete query.interests
  }

  if (query.learningStyles) {
    const styles = (query.learningStyles as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (styles.length > 0) {
      orConditions.push({ advisingStyles: { $in: styles } }) // ← was learningStyles
    }
    delete query.learningStyles
  }

  if (query.availability) {
    const days = (query.availability as string)
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean) as ('sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[]
    if (days.length > 0) {
      orConditions.push({ 'availability.day': { $in: days } })
    }
    delete query.availability
  }

  if (query.rating) {
    const ratings = (query.rating as string)
      .split(',')
      .map((r) => Number(r.trim()))
      .filter((n) => !isNaN(n) && n > 0)
    if (ratings.length > 0) {
      const minRating = Math.min(...ratings)
      const maxRating = Math.max(...ratings)
      orConditions.push({
        avgRating: { $gte: minRating, $lte: maxRating + 0.99 },
      })
    }
    delete query.rating
  }

  if (query.sessionDurations) {
    const durations = (query.sessionDurations as string)
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((n) => !isNaN(n) && n > 0)
    if (durations.length > 0) {
      orConditions.push({ 'sessionDurations.duration': { $in: durations } })
    }
    delete query.sessionDurations
  }

  // ✅ orConditions থাকলে $or যোগ করো, না থাকলে শুধু mustMatch
  const baseQuery: QueryFilter<TUser> =
    orConditions.length > 0 ? { ...mustMatch, $or: orConditions } : mustMatch

  const selectFields =
    '_id id firstName lastName email phoneNumber photoUrl role headline following followers points avgRating skills languages expertise status isProfileSetup createdAt hourlyRate sessionDurations availability interests learningStyles' +
    // dob is personal data: admin only, so under-18 sign-ups can be spotted (QA #6)
    (options?.includeDob ? ' dob warningCount lastWarnedAt' : '')

  // QueryBuilder.fields() only lets `?fields=` narrow this list, never extend it
  const usersQuery = new QueryBuilder(
    User.find(baseQuery).select(selectFields),
    query,
  )
    .search(['firstName', 'lastName', 'expertise', 'skills'])
    .filter()
    .sort()
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  const expertIds = experts.map((e) => e._id.toString())
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(currentUserId, expertIds),
    getTotalBookingsBatch(expertIds),
  ])

  const enrichedResult = experts.map((expert) => {
    const obj = expert.toObject()
    return {
      ...obj,
      // Price always from hourlyRate; stored offeredPrice can be stale (#32)
      ...(obj.sessionDurations
        ? { sessionDurations: withSessionPrices(obj.sessionDurations, obj.hourlyRate) }
        : {}),
      isFollowing: followingMap.get(expert._id.toString()) || false,
      totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
    }
  })

  const activeCounts = await User.aggregate([
    {
      $match: {
        isDeleted: false,
        role: { $ne: USER_ROLE.admin },
        status: USER_STATUS.active,
      },
    },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
      },
    },
  ])

  const activeConsult =
    activeCounts.find((item) => item._id === USER_ROLE.consult)?.count || 0
  const activeExpert =
    activeCounts.find((item) => item._id === USER_ROLE.expert)?.count || 0

  return {
    meta,
    data: {
      totalUsers: meta.total,
      activeConsult,
      activeExpert,
      userList: enrichedResult,
    },
  }
}

// 1. Interest-based experts
const getInterestExpertsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const currentUser = await User.findById(userId).select(
    'role interests expertise',
  )
  if (!currentUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const { role, interests, expertise } = currentUser

  let matchConditions: any[] = []

  if (role === USER_ROLE.expert) {
    if (expertise?.length) {
      matchConditions.push({
        $or: [
          { expertise: { $in: expertise } },
          { skills: { $in: expertise } },
        ],
      })
    }
  } else {
    if (interests?.length) {
      matchConditions.push({
        $or: [
          { expertise: { $in: interests } },
          { skills: { $in: interests } },
        ],
      })
    }
  }

  // 🔥 Fallback: যদি কোনো condition না থাকে, তাহলে সব expert দেখাবে
  if (matchConditions.length === 0) {
    matchConditions = [{}]
  }

  const baseFilter = {
    _id: { $ne: new Types.ObjectId(userId) },
    isDeleted: false,
    status: USER_STATUS.active,
    role: USER_ROLE.expert,
    $or: matchConditions,
  }

  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate createdAt',
    ),
    query,
  )
    .sort()
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery

  // Batch isFollowing + totalBookings
  const expertIds = experts.map((e) => e._id.toString())
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ])

  const mapped = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))
  const result = await withLast90DaysRanking(mapped)

  const meta = await usersQuery.countTotal()

  return { meta, result }
}

// 2. Property experts
const getPropertyExpertsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const filter = {
    _id: { $ne: new Types.ObjectId(userId) },
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { expertise: { $in: ['Property & Real Estate'] } },
      { skills: { $in: PROPERTY_SKILLS } },
    ],
  }

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate createdAt',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery

  // Batch isFollowing + totalBookings
  const expertIds = experts.map((e) => e._id.toString())
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ])

  const mapped = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))
  const result = await withLast90DaysRanking(mapped)

  const meta = await usersQuery.countTotal()

  return { meta, result }
}

// 3. Top experts
const getTopExpertsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const filter = {
    _id: { $ne: new Types.ObjectId(userId) },
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    avgRating: { $gte: 4 },
  }

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline avgRating ratingCount followers hourlyRate createdAt',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      ratingCount: -1,
      followers: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery

  // Batch isFollowing + totalBookings
  const expertIds = experts.map((e) => e._id.toString())
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ])

  const mapped = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))
  const result = await withLast90DaysRanking(mapped)

  const meta = await usersQuery.countTotal()

  return { meta, result }
}

// ====================== PUBLIC VERSIONS (Non-Auth) ======================

// 1. Public Interest Experts
const getPublicInterestExpertsFromDB = async (
  query: Record<string, unknown>,
) => {
  const { interests } = query

  let matchConditions: any[] = []

  if (interests) {
    const interestList = (interests as string).split(',').map((i) => i.trim())
    if (interestList.length > 0) {
      matchConditions.push({
        $or: [
          { expertise: { $in: interestList } },
          { skills: { $in: interestList } }, // 👈 skills ফিল্ডেও match করো
        ],
      })
    }
  }

  // Fallback: যদি interests না দেয়া হয় তাহলে সব expert দেখাবে
  if (matchConditions.length === 0) {
    matchConditions = [{}]
  }

  const baseFilter = {
    isDeleted: false,
    status: USER_STATUS.active,
    role: USER_ROLE.expert,
    $or: matchConditions,
  }

  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate createdAt',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  const mapped = experts.map((expert: any) => ({
    ...expert.toObject(),
    isFollowing: false, // non-auth user → always false
    totalBookings: 0, // non-auth → hide sensitive count
  }))
  const result = await withLast90DaysRanking(mapped)

  return { meta, result }
}

// 2. Public Property Experts
const getPublicPropertyExpertsFromDB = async (
  query: Record<string, unknown>,
) => {
  const baseFilter = {
    isDeleted: false,
    status: USER_STATUS.active,
    role: USER_ROLE.expert,
    $or: [
      { expertise: { $in: ['Property & Real Estate'] } },
      { skills: { $in: PROPERTY_SKILLS } },
    ],
  }

  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate createdAt',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  const mapped = experts.map((expert: any) => ({
    ...expert.toObject(),
    isFollowing: false,
    totalBookings: 0,
  }))
  const result = await withLast90DaysRanking(mapped)

  return { meta, result }
}

// 3. Public Top Experts
const getPublicTopExpertsFromDB = async (query: Record<string, unknown>) => {
  const baseFilter = {
    isDeleted: false,
    status: USER_STATUS.active,
    role: USER_ROLE.expert,
    avgRating: { $gte: 4 },
  }

  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id firstName lastName photoUrl headline avgRating ratingCount followers hourlyRate createdAt',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      ratingCount: -1,
      followers: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  const mapped = experts.map((expert: any) => ({
    ...expert.toObject(),
    isFollowing: false,
    totalBookings: 0,
  }))
  const result = await withLast90DaysRanking(mapped)

  return { meta, result }
}

// 4. Investment experts
const getInvestmentExperts = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const filter = {
    _id: { $ne: new Types.ObjectId(userId) },
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { expertise: { $in: ['Property Investment & Development'] } },
      { skills: { $in: INVESTMENT_SKILLS } },
    ],
  }

  const queryBuilder = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline avgRating ratingCount followers',
    ),
    query,
  )
    .search(['firstName', 'lastName'])
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      createdAt: -1,
    })
    .paginate()
    .fields()

  const experts = await queryBuilder.modelQuery

  // Batch isFollowing + totalBookings
  const expertIds = experts.map((e) => e._id.toString())
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ])

  const result = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))

  const meta = await queryBuilder.countTotal()

  return { meta, result }
}

// Price always from hourlyRate, same as the booking charge (#32)
const enrichSessionDurationsWithPrice = (
  sessionDurations: any[],
  hourlyRate: number,
) => withSessionPrices(sessionDurations, hourlyRate)

const geUserByIdFromDB = async (
  viewerId: string,
  viewedUserId: string,
  viewerRole?: string,
) => {
  try {
    const isSelf = String(viewerId) === String(viewedUserId)
    const user = await User.findById(viewedUserId)
      .select(
        '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto introVideoUrl headline points referralCode socialProfiles hourlyRate priceRange interests learningStyles availability advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability role registerWith languages education stripeAccountId isTopExpert pushNotify emailNotify isVatRegistered vatRegistrationNumber country status createdAt bookingRules lastLogAt' +
          // dob is personal data: only admins see other users' birth dates (QA #6)
          (viewerRole === USER_ROLE.admin ? ' dob warnings warningCount lastWarnedAt' : '') +
          // Own profile: onboarding state, so the app can resume it (#13)
          (isSelf ? ` ${ONBOARDING_FIELDS} isEmailVerified` : ''),
      )
      .lean()

    if (!user || user.isDeleted)
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')

    // Record the view once per viewer. No transaction: the rest of this
    // function only reads. Concurrent first views of the same pair race on
    // the unique index; the loser's E11000 means the row exists, which is fine.
    if (viewerId !== viewedUserId) {
      try {
        await ProfileView.updateOne(
          { viewer: viewerId, viewedUser: viewedUserId },
          { $setOnInsert: { viewedAt: new Date() } },
          { upsert: true },
        )
      } catch (err: any) {
        if (err?.code !== 11000) throw err
      }
    }

    // ── Dynamic VAT Rate Fetch (if user is VAT registered) ─────────────────────
    let vatPercentage: number | null = null;
    if (user.isVatRegistered && user.country) {
      vatPercentage = await getVatRateForCountry(user.country);
    }

    const last7Days = dayjs().subtract(7, 'day').toDate()
    const last90Days = dayjs().subtract(90, 'day').toDate()
    const partyField =
      user.role === USER_ROLE.expert ? 'consult' : 'user'
    const partyFilter = {
      [partyField]: new Types.ObjectId(viewedUserId),
      paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
      isDeleted: false,
    }

    const [
      completedBookingsCount,
      totalBookingsCountAll,
      profileViewCount,
      isFollowing,
      totalWithdrawResult,
      pendingWithdrawResult,
      last7DaysFollowersCount,
      totalFollowersCount,
      totalFollowingCount,
      cancellationBookings,
      last90DaysTotalBookings,
      last90DaysCancellationBookings,
      noShowBookings,
      // Pending booking count — field differs by role
      pendingBookingsCount,
    ] = await Promise.all([
      Booking.countDocuments({
        consult: viewedUserId,
        status: BOOKING_STATUS.completed,
        paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
        isDeleted: false,
      }),

      Booking.countDocuments(partyFilter),

      ProfileView.countDocuments({
        viewedUser: viewedUserId,
        viewedAt: { $gte: last7Days },
      }),

      Follow.exists({ follower: viewerId, following: viewedUserId }),

      Withdraw.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(viewedUserId),
            status: WITHDRAW_STATUS.completed,
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Withdraw.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(viewedUserId),
            status: { $in: [WITHDRAW_STATUS.proceed, WITHDRAW_STATUS.hold] },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      Follow.countDocuments({
        following: viewedUserId,
        createdAt: { $gte: last7Days },
      }),

      Follow.countDocuments({ following: viewedUserId }),

      Follow.countDocuments({ follower: viewedUserId }),

      Booking.countDocuments({
        ...partyFilter,
        status: BOOKING_STATUS.cancelled,
      }),

      Booking.countDocuments({
        ...partyFilter,
        createdAt: { $gte: last90Days },
      }),

      Booking.countDocuments({
        ...partyFilter,
        status: BOOKING_STATUS.cancelled,
        createdAt: { $gte: last90Days },
      }),

      user.role === USER_ROLE.expert
        ? Booking.countDocuments({
          consult: new Types.ObjectId(viewedUserId),
          status: BOOKING_STATUS.not_responded,
          paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
          isDeleted: false,
          $or: [
            { noShowBy: { $in: [BOOKING_NO_SHOW_BY.consultant, BOOKING_NO_SHOW_BY.both] } },
            { noShowBy: { $exists: false } },
            { noShowBy: null },
          ],
        })
        : Booking.countDocuments({
          user: new Types.ObjectId(viewedUserId),
          status: BOOKING_STATUS.not_responded,
          noShowBy: { $in: [BOOKING_NO_SHOW_BY.consultee, BOOKING_NO_SHOW_BY.both] },
          paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
          isDeleted: false,
        }),

      // ✅ role = expert → consult field, role = consult/user → user field
      user.role === USER_ROLE.expert
        ? Booking.countDocuments({
          consult: new Types.ObjectId(viewedUserId),
          status: BOOKING_STATUS.pending,
          isDeleted: false,
        })
        : Booking.countDocuments({
          user: new Types.ObjectId(viewedUserId),
          status: BOOKING_STATUS.pending,
          isDeleted: false,
        }),
    ])

    const totalWithdraw = totalWithdrawResult[0]?.total || 0
    const pendingWithdraw = pendingWithdrawResult[0]?.total || 0

    const followerGrowthRate =
      totalFollowersCount > 0
        ? parseFloat(
          ((last7DaysFollowersCount / totalFollowersCount) * 100).toFixed(2),
        )
        : 0

    // ✅ 2. Advising time in human-readable format
    let advisingTime = 0

    if (user.role === USER_ROLE.expert) {
      const totalMinutesResult = await Booking.aggregate([
        {
          $match: {
            consult: new Types.ObjectId(viewedUserId),
            status: BOOKING_STATUS.completed,
          },
        },
        { $group: { _id: null, totalMinutes: { $sum: '$sessionDuration' } } },
      ])

      const totalMinutes: number = totalMinutesResult[0]?.totalMinutes || 0
      advisingTime = Number((totalMinutes).toFixed(2))
    }

    const avgAttendance =
      totalBookingsCountAll > 0
        ? Math.min(
          Math.round((completedBookingsCount / totalBookingsCountAll) * 100),
          100,
        )
        : 0

    const { cancellationRate, cancellationRateLast90Days } =
      getCancellationRates(
        totalBookingsCountAll,
        cancellationBookings,
        last90DaysTotalBookings,
        last90DaysCancellationBookings,
      )

    const profileSetupProgress = calculateProfileSetupProgress(user)

    const sessionDurationsWithPrice = enrichSessionDurationsWithPrice(
      user.sessionDurations || [],
      user.hourlyRate || 0,
    )

    return {
      ...user,
      ...(isSelf ? { needsOnboarding: getNeedsOnboarding(user) } : {}),
      sessionDurations: sessionDurationsWithPrice,
      totalBookings: totalBookingsCountAll,
      pendingBookings: pendingBookingsCount,
      cancellationBookings,
      cancellationRate,
      cancellationRateLast90Days,
      noShowBookings,
      profileSetupProgress,
      advisingTime,
      avgAttendance,
      isFollowing: !!isFollowing,
      profileViewCount,
      totalWithdraw,
      pendingWithdraw,
      followerGrowthRate,
      followers: totalFollowersCount,
      following: totalFollowingCount,
      lastLogAt: user.lastLogAt ?? null,
      isConnectedStripe: !!user.stripeAccountId,
      isVatRegisted: user.isVatRegistered ?? false,
      vatRegistrationNumber: user.vatRegistrationNumber ?? null,
      vatPercentage: vatPercentage || 0,
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[geUserByIdFromDB] failed', error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch user profile',
    )
  }
}

const changeUserStatusFromDB = async (
  payload: {
    userId: string
    status: TUserStatus
    reason?: string
  },
  adminId?: string,
) => {
  const { userId, status, reason } = payload

  // 1. User find
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  // 2.status updated
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { status },
    { returnDocument: 'after' },
  ).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline status createdAt role points fcmToken pushNotify',
  )

  if (!updatedUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User not found and failed to update status!',
    )
  }

  // 3. expert account approved
  if (
    status === USER_STATUS.active &&
    user.status === USER_STATUS.pending &&
    user.role === USER_ROLE.expert
  ) {
    const awarded = await PointsService.awardByKey({
      userId: updatedUser._id,
      key: POINTS_REWARD_KEY.admin_approval,
      reason: 'Expert account approval reward',
    })
    if (awarded) {
      updatedUser.points = (updatedUser.points || 0) + awarded.points
    }
    // Referral stays pending until first paid session completes
    // (settlePendingReferralRewards also requires expert status === active).
  }

  // 4. notify to admin and user
  // await sendUserStatusNotifYToUser(status, updatedUser)
  await sendUserStatusNotifYToAdmin(status, updatedUser)

  // 5. Blocked or Active email sent to user
  if (status === USER_STATUS.blocked || status === USER_STATUS.active) {
    await generateUserStatusEmail(user, status)
  }

  // 6. Warning (#70): record it, notify in the app and by email
  if (status === USER_STATUS.warning) {
    const warned = await recordUserWarning({
      userId: user._id,
      reason,
      source: 'admin',
      adminId,
    })
    if (warned) {
      updatedUser.set('warningCount', warned.warningCount)
    }

    const copy = getWarningCopy(reason)
    await notifyUserInApp({
      receiver: user._id,
      message: copy.message,
      description: copy.description,
      reference: user._id,
      modelType: modeType.User,
      fcmToken: user.fcmToken,
    })
    try {
      await sendWarningEmail(user, reason)
    } catch (err) {
      console.error('[changeUserStatus] warning email failed', err)
    }
  }

  return updatedUser
}

const changeUserNotifyFromDB = async (id: string, payload: any) => {
  // 1️⃣ Validate user
  const user = await User.findById(id)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  // 4️⃣ Update user
  const result = await User.findByIdAndUpdate(id, payload, {
    returnDocument: 'after',
  }).select(
    '_id id firstName lastName email photoUrl headline status createdAt pushNotify emailNotify',
  )
  if (!result) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User not found and failed to update notification settings!',
    )
  }

  return result
}

const updateUserInfoFromDB = async (
  userId: string,
  payload: Partial<TUser>,
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const user = await User.findById(userId).session(session)
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    // update-profile has no zod schema, so enforce the age rule here (QA #5).
    // Only when dob actually changes, so legacy-format dobs don't block
    // unrelated profile edits.
    if (payload.dob !== undefined && payload.dob !== user.dob) {
      const dobError = getDobError(String(payload.dob))
      if (dobError) {
        throw new AppError(httpStatus.BAD_REQUEST, dobError)
      }
    }

    // Mass assignment (Phase 0): role, status, points, verification flags,
    // referral, VAT, etc. can't be set here. This also drops email (#26,
    // OTP flow), phoneNumber (#12/#26, OTP flow) and introVideoUrl (#31).
    // Bonus logic below may add points itself, after this.
    const finalPayload: Partial<TUser> = stripProtectedProfileFields(payload)

    if (payload.bookingRules) {
      const defaults = getDefaultBookingRules()
      const currentRules = user.bookingRules || defaults
      const incomingRules = payload.bookingRules as Partial<
        typeof defaults
      >
      const slotBufferStep =
        incomingRules.slotBufferStep ??
        currentRules.slotBufferStep ??
        defaults.slotBufferStep

      finalPayload.bookingRules = {
        minNotice:
          incomingRules.minNotice ??
          currentRules.minNotice ??
          defaults.minNotice,
        bookingHorizonDays:
          incomingRules.bookingHorizonDays ??
          currentRules.bookingHorizonDays ??
          defaults.bookingHorizonDays,
        slotBufferStep,
        bufferRules: buildBufferRulesFromSlotBufferStep(slotBufferStep),
      }
    }

    // Step 1: Rate and session prices (#32)
    // A new rate alone must also refresh every offeredPrice, or the profile
    // shows the old price while bookings charge the new one.
    const hasNewDurations =
      Array.isArray(payload.sessionDurations) && payload.sessionDurations.length > 0
    const hasNewRate = payload.hourlyRate !== undefined && payload.hourlyRate !== null

    if (hasNewDurations || hasNewRate) {
      const effectiveHourlyRate = hasNewRate
        ? Number(payload.hourlyRate)
        : Number(user.hourlyRate)

      if (!(effectiveHourlyRate > 0)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Hourly rate must be greater than 0.',
        )
      }

      const durations = hasNewDurations
        ? payload.sessionDurations!
        : ((user.sessionDurations || []) as any[]).map((d: any) =>
          typeof d?.toObject === 'function' ? d.toObject() : { ...d },
        )

      finalPayload.hourlyRate = effectiveHourlyRate
      finalPayload.sessionDurations = withSessionPrices(
        durations,
        effectiveHourlyRate,
      ).map(({ price: _price, ...rest }) => rest) as any
    }

    // Step 2: Social profile addition reward
    const isExpert = user.role === USER_ROLE.expert

    if (
      isExpert &&
      payload.socialProfiles &&
      payload.socialProfiles.length > 0
    ) {
      const previouslyEmpty =
        !user.socialProfiles || user.socialProfiles.length === 0

      if (previouslyEmpty && !user.socialProofBonusClaimed) {
        const awarded = await PointsService.awardByKey({
          userId: user._id,
          key: POINTS_REWARD_KEY.social_links,
          reason: 'Social profile addition reward',
          session,
          skipPush: true,
        })
        if (awarded) {
          user.points = (user.points || 0) + awarded.points
          finalPayload.points = user.points
          finalPayload.socialProofBonusClaimed = true
        }
      }
    }

    // Step 3: Profile completion bonus logic
    const isConsult = user.role === USER_ROLE.consult

    const requiredFields = isConsult
      ? [
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dob',
        'photoUrl',
        'coverPhoto',
        'timeZone',
        'priceRange',
        'interests',
        'learningStyles',
        'availability',
      ]
      : [
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dob',
        'photoUrl',
        'coverPhoto',
        'bio',
        'socialProfiles',
        'hourlyRate',
        'expertise',
        'skills',
        'advisingStyles',
        'sessionDurations',
        'availability',
      ]

    const isProfileNowComplete = requiredFields.every((field) => {
      const value =
        (finalPayload as any)[field] !== undefined
          ? (finalPayload as any)[field]
          : (user as any)[field]

      if (Array.isArray(value)) return value.length > 0
      return value !== undefined && value !== null && value !== ''
    })

    if (isProfileNowComplete && !user.profileCompletionBonusClaimed) {
      const awarded = await PointsService.awardByKey({
        userId: user._id,
        key: POINTS_REWARD_KEY.profile_complete,
        reason: `${isExpert ? 'Expert' : 'Consult'} profile completion reward`,
        session,
        skipPush: true,
      })
      if (awarded) {
        user.points = (user.points || 0) + awarded.points
        finalPayload.points = user.points
        finalPayload.profileCompletionBonusClaimed = true
      }
    }

    // Step 5: Apply payload and save
    Object.assign(user, finalPayload)
    const updatedUser = await user.save({ session })

    await session.commitTransaction()

    const profileSetupProgress = calculateProfileSetupProgress(updatedUser)
    const safeUpdatedUser = updatedUser.toObject()
    delete (safeUpdatedUser as any).password

    return {
      ...safeUpdatedUser,
      profileSetupProgress,
    }
  } catch (error) {
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to update user information',
      )
  } finally {
    session.endSession()
  }
}

const updateLocationFromDB = async (
  userId: string,
  payload: { longitude: number; latitude: number; address: string },
) => {
  const { longitude, latitude, address } = payload

  //* if the user is is not exist
  const user = await User.findById(userId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  if (!longitude || !latitude) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Longitude and latitude are required',
    )
  }

  const result = await User.findByIdAndUpdate(
    userId,
    {
      location: { type: 'Point', coordinates: [longitude, latitude] },
      address: address,
    },
    { returnDocument: 'after' },
  ).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto status createdAt',
  )

  return result
}

const softDeleteUserFromDB = async (userId: string) => {
  await assertUserCanDeleteProfile(userId)

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    await removeUserContentData(userId, session)

    const result = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isDeleted: true,
          pendingReferralReward: false,
        },
        $unset: {
          referredBy: 1,
          attributedExpert: 1,
          attributedAt: 1,
        },
      },
      { returnDocument: 'after', session },
    ).select(
      '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto status createdAt',
    )

    if (!result) {
      throw new AppError(httpStatus.NOT_FOUND, 'Failed to update user status!')
    }

    await session.commitTransaction()
    return result
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const deleteAUserFromDB = async (userId: string) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user id')
  }

  const user = await User.findById(userId).select('_id isDeleted')
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  return softDeleteUserFromDB(userId)
}

const deleteUserProfileByAdminFromDB = async (
  targetUserId: string,
  adminId: string,
) => {
  if (!Types.ObjectId.isValid(targetUserId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user id')
  }

  if (targetUserId === adminId.toString()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Use delete-profile endpoint to delete your own account',
    )
  }

  const user = await User.findById(targetUserId).select('_id role isDeleted')
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  if (user.role === USER_ROLE.admin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Admin accounts cannot be deleted')
  }

  return softDeleteUserFromDB(targetUserId)
}

/**
 * Update VAT info for consultant
 * Validates VAT number and fetches current VAT rate from jsonvat.com
 */
const updateVatInfoFromDB = async (userId: string, payload: {
  country: string
  isVatRegistered: boolean
  vatRegistrationNumber?: string
}) => {
  const user = await User.findById(userId)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  // Validate VAT number if user is VAT registered
  if (payload.isVatRegistered && payload.vatRegistrationNumber) {
    const validationResult = await validateVatNumber(payload.country, payload.vatRegistrationNumber)

    if (!validationResult.valid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Invalid VAT registration number for country ${payload.country}`,
      )
    }
  }

  // Update user
  user.country = payload.country
  user.isVatRegistered = payload.isVatRegistered
  user.vatRegistrationNumber = payload.isVatRegistered ? (payload.vatRegistrationNumber || '') : null

  await user.save()

  return {
    country: user.country,
    isVatRegistered: user.isVatRegistered,
    isVatRegisted: user.isVatRegistered,
    vatRegistrationNumber: user.vatRegistrationNumber,
    vatRegistration: user.vatRegistrationNumber,
  }
}

const adjustUserPointsFromDB = async (
  userId: string,
  payload: { type: TPointsLogType; points: number; reason: string },
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  let updatedUser: any
  let committed = false

  try {
    const user = await User.findById(userId).session(session)
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    const currentPoints = user.points || 0
    const newPoints =
      payload.type === POINTS_LOG_TYPE.credit
        ? currentPoints + payload.points
        : currentPoints - payload.points

    if (newPoints < 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Insufficient points balance for debit adjustment',
      )
    }

    user.points = newPoints
    updatedUser = await user.save({ session })

    await createPointsLog(
      user._id,
      payload.points,
      payload.reason,
      POINTS_LOG_SOURCE.manual_adjustment,
      payload.type,
      session,
    )

    await session.commitTransaction()
    committed = true
  } catch (error) {
    if (!committed) {
      await session.abortTransaction()
    }
    throw error
  } finally {
    session.endSession()
  }

  if (updatedUser?.fcmToken && updatedUser.pushNotify?.points) {
    const actionText =
      payload.type === POINTS_LOG_TYPE.credit ? 'credited to' : 'debited from'

    await sendNotification([updatedUser.fcmToken], {
      receiver: updatedUser._id,
      message: 'Points Balance Updated',
      description: `${payload.points} points have been ${actionText} your Consultz account. Reason: ${payload.reason}`,
      reference: updatedUser._id,
      modelType: modeType.Achievement,
    })
  }

  return {
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    points: updatedUser.points,
  }
}

// ---------- Email change with OTP (#26) ----------

const emailOtpHtml = (
  firstName: string,
  otp: string | number,
  expiresAt: moment.Moment,
) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: left; padding: 10px 20px;">
          <h2 style="color: #333;">Confirm your new email</h2>
          <p style="color: #555; margin-top: 10px;">Dear ${firstName},</p>
          <p style="color: #555;">Use this code to confirm this address as your new Consultz email.</p>
          <div style="text-align: center; margin: 20px 0;">
            <span style="padding: 10px 20px; font-size: 18px; font-weight: bold; border-radius: 5px; display: inline-block;">
              ${otp}
            </span>
          </div>
          <p style="color: #555;">This code is valid until: <strong>${expiresAt.toLocaleString()}</strong></p>
          <p style="color: #555;">If you did not request this, please ignore this email.</p>
          <p style="color: #555;">Thank you,<br/>Consultz Team</p>
        </div>
      </div>
    `

const emailChangedNoticeHtml = (
  firstName: string,
  newEmail: string,
  byAdmin = false,
) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: left; padding: 10px 20px;">
          <h2 style="color: #333;">Your email was changed</h2>
          <p style="color: #555; margin-top: 10px;">Dear ${firstName},</p>
          <p style="color: #555;">The email on your Consultz account was changed${byAdmin ? ' by our support team' : ''} to <strong>${newEmail}</strong>. You'll now sign in with this address.</p>
          <p style="color: #555;">If you didn't ${byAdmin ? 'ask for' : 'make'} this change, please contact Consultz support right away.</p>
          <p style="color: #555;">Thank you,<br/>Consultz Team</p>
        </div>
      </div>
    `

const requestEmailChange = async (userId: string, newEmailInput: string) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const newEmail = normalizeEmail(newEmailInput)
  const error = getEmailChangeError({
    registerWith: user.registerWith,
    currentEmail: normalizeEmail(user.email),
    newEmail,
    isEmailVerified: user.isEmailVerified,
  })
  if (error) throw new AppError(httpStatus.BAD_REQUEST, error)

  await assertEmailAvailable(newEmail, user._id)

  const otp = generateOtp()
  const expiresAt = moment().add(5, 'minute')

  await User.findByIdAndUpdate(user._id, {
    $set: {
      pendingEmail: newEmail,
      verification: { otp, expiresAt: expiresAt.toDate(), status: false },
    },
  })

  const html = emailOtpHtml(user.firstName, otp, expiresAt)

  // Same mock behaviour as sendOtpInEmail: return the OTP outside production
  if (config.node_env !== 'production') {
    console.log('🔑 [MOCK OTP] Change email to:', newEmail, 'Code:', otp)
    try {
      await emailSender(newEmail, 'Confirm your new email', html)
    } catch (err) {
      console.error('[Email OTP Error][requestEmailChange] (ignored in dev)', err)
    }
    return { pendingEmail: newEmail, otp, mock: true }
  }

  await emailSender(newEmail, 'Confirm your new email', html)
  return { pendingEmail: newEmail }
}

const verifyEmailChange = async (userId: string, otp: string | number) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }
  if (!user.pendingEmail) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No email change is pending. Please request a new code.',
    )
  }
  if (!user.verification?.expiresAt || new Date() > user.verification.expiresAt) {
    throw new AppError(httpStatus.FORBIDDEN, 'OTP has expired. Please resend it')
  }
  // A used OTP is stored as 0, so 0 must never match
  if (!user.verification?.otp || Number(otp) !== Number(user.verification.otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP did not match')
  }

  const newEmail = user.pendingEmail
  const oldEmail = user.email

  // Someone may have taken it since the request
  await assertEmailAvailable(newEmail, user._id)

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        email: newEmail,
        isEmailVerified: true,
        pendingEmail: null,
        verification: { otp: 0, status: false },
      },
    },
    { returnDocument: 'after' },
  )
  if (!updatedUser) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email was not changed. Please try again!')
  }

  // Tell the old address, in case the change wasn't the owner's doing.
  // Skipped when an unverified email was just confirmed as-is (#65).
  if (normalizeEmail(oldEmail) !== normalizeEmail(newEmail)) {
    try {
      await emailSender(
        oldEmail,
        'Your Consultz email was changed',
        emailChangedNoticeHtml(user.firstName, newEmail),
      )
    } catch (err) {
      console.error('[verifyEmailChange] notice to old email failed', err)
    }
  }

  // The old token carries the old email, so auth() would reject it
  return generateTokens(updatedUser)
}

// Best effort: a leftover S3 object shouldn't fail the request
const deleteIntroVideoObject = async (url?: string | null) => {
  const key = getS3KeyFromUrl(url, config.aws.s3BaseUrl)
  if (!key) return
  try {
    await deleteFromS3(key)
  } catch (err) {
    console.error('[introVideo] failed to delete old video', key, err)
  }
}

/** Upload or replace the expert's intro video (#31). */
const uploadIntroVideo = async (userId: string, file?: Express.Multer.File) => {
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Please choose a video to upload.')
  }
  const fileError = getIntroVideoFileError(file.mimetype)
  if (fileError) throw new AppError(httpStatus.BAD_REQUEST, fileError)

  const user = await User.findById(userId).select('introVideoUrl isDeleted')
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const url = await uploadToS3({
    file,
    fileName: `videos/user/intro/${userId}-${Date.now()}.${getIntroVideoExtension(file.mimetype)}`,
  })
  if (!url) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Video upload failed. Please try again.')
  }

  const oldUrl = user.introVideoUrl
  await User.findByIdAndUpdate(userId, { $set: { introVideoUrl: url } })

  // Only remove the old one after the new one is saved
  if (oldUrl && oldUrl !== url) await deleteIntroVideoObject(oldUrl)

  return { introVideoUrl: url }
}

const removeIntroVideo = async (userId: string) => {
  const user = await User.findById(userId).select('introVideoUrl isDeleted')
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }
  if (!user.introVideoUrl) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You have no intro video to remove.')
  }

  const oldUrl = user.introVideoUrl
  await User.findByIdAndUpdate(userId, { $set: { introVideoUrl: null } })
  await deleteIntroVideoObject(oldUrl)

  return { introVideoUrl: null }
}

const emailNowActiveHtml = (firstName: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: left; padding: 10px 20px;">
          <h2 style="color: #333;">Your Consultz email was updated</h2>
          <p style="color: #555; margin-top: 10px;">Dear ${firstName},</p>
          <p style="color: #555;">Our support team has set this address as the email for your Consultz account. Please log in with this email and your existing password.</p>
          <p style="color: #555;">If you didn't ask for this, please contact Consultz support.</p>
          <p style="color: #555;">Thank you,<br/>Consultz Team</p>
        </div>
      </div>
    `

/**
 * Admin corrects a user's email from the dashboard (#67). No OTP: support has
 * already confirmed who the user is. The user's old tokens stop working (they
 * carry the old email), so they log in again with the new email.
 */
const adminUpdateUserEmail = async (
  adminId: string,
  userId: string,
  newEmailInput: string,
  reason?: string,
) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }
  if (user.role === USER_ROLE.admin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "An admin account's email can't be changed here.",
    )
  }

  const newEmail = normalizeEmail(newEmailInput)
  const oldEmail = user.email
  const error = getAdminEmailChangeError({
    registerWith: user.registerWith,
    currentEmail: normalizeEmail(oldEmail),
    newEmail,
  })
  if (error) throw new AppError(httpStatus.BAD_REQUEST, error)

  await assertEmailAvailable(newEmail, user._id)

  const updated = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        email: newEmail,
        isEmailVerified: true,
        // cancel any self-service change or OTP still in progress
        pendingEmail: null,
        verification: { otp: 0, status: false },
      },
    },
    { returnDocument: 'after' },
  ).select('_id email isEmailVerified')
  if (!updated) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email was not changed. Please try again!')
  }

  console.info('[admin email change]', {
    adminId: String(adminId),
    userId: String(user._id),
    from: oldEmail,
    to: newEmail,
    reason: reason || null,
  })

  // Notices: the old address (in case it wasn't the owner asking) and the new one
  try {
    await emailSender(
      oldEmail,
      'Your Consultz email was changed',
      emailChangedNoticeHtml(user.firstName, newEmail, true),
    )
  } catch (err) {
    console.error('[adminUpdateUserEmail] notice to old email failed', err)
  }
  try {
    await emailSender(
      newEmail,
      'Your Consultz email was updated',
      emailNowActiveHtml(user.firstName),
    )
  } catch (err) {
    console.error('[adminUpdateUserEmail] notice to new email failed', err)
  }

  return updated
}

const phoneChangedNoticeHtml = (firstName: string, maskedPhone: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: left; padding: 10px 20px;">
          <h2 style="color: #333;">Your Consultz phone number was changed</h2>
          <p style="color: #555; margin-top: 10px;">Dear ${escapeHtml(firstName || '')},</p>
          <p style="color: #555;">Our support team has changed the phone number on your Consultz account to <strong>${escapeHtml(maskedPhone)}</strong>.</p>
          <p style="color: #555;">If you didn't ask for this, please contact Consultz support right away.</p>
          <p style="color: #555;">Thank you,<br/>Consultz Team</p>
        </div>
      </div>
    `

// "+447700900123" → "+44 ••• ••• 123"; the notice shouldn't carry the full number
const maskPhone = (phone: string) =>
  phone.length > 6 ? `${phone.slice(0, 3)} ••• ••• ${phone.slice(-3)}` : phone

/**
 * Admin corrects a user's phone number from the dashboard (#67). No OTP:
 * support has already confirmed who the user is, so the number is set as
 * verified. Tokens carry the email, so the user stays logged in.
 */
const adminUpdateUserPhone = async (
  adminId: string,
  userId: string,
  phoneInput: string,
  reason?: string,
) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }
  if (user.role === USER_ROLE.admin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "An admin account's phone number can't be changed here.",
    )
  }

  const phoneError = getPhoneError(phoneInput)
  if (phoneError) {
    throw new AppError(httpStatus.BAD_REQUEST, phoneError)
  }
  const newPhone = normalizePhone(phoneInput)
  const oldPhone = user.phoneNumber || null
  if (oldPhone && normalizePhone(oldPhone) === newPhone && user.isPhoneOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This is already the phone number on the account.')
  }

  // 409 if another live, completed account owns the number (#12)
  await assertPhoneAvailable(newPhone, user._id)

  const updated = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        phoneNumber: newPhone,
        isPhoneOtpVerified: true,
        // cancel any self-service phone change or OTP still in progress
        pendingPhoneNumber: null,
        verification: { otp: 0, status: false },
      },
    },
    { returnDocument: 'after' },
  ).select('_id phoneNumber isPhoneOtpVerified')
  if (!updated) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Phone number was not changed. Please try again!')
  }

  console.info('[admin phone change]', {
    adminId: String(adminId),
    userId: String(user._id),
    from: oldPhone,
    to: newPhone,
    reason: reason || null,
  })

  try {
    await emailSender(
      user.email,
      'Your Consultz phone number was changed',
      phoneChangedNoticeHtml(user.firstName, maskPhone(newPhone)),
    )
  } catch (err) {
    console.error('[adminUpdateUserPhone] notice email failed', err)
  }

  return updated
}

export const UserService = {
  adminUpdateUserEmail,
  adminUpdateUserPhone,
  uploadIntroVideo,
  removeIntroVideo,
  requestEmailChange,
  verifyEmailChange,
  registerUserIntoDB,
  completeOnboardingIntoDB,
  applyReferralCodeToUser,
  getAllUsersFromDB,
  getInvestmentExperts,
  getInterestExpertsFromDB,
  getTopExpertsFromDB,
  getPublicInterestExpertsFromDB,
  getPublicPropertyExpertsFromDB,
  getPublicTopExpertsFromDB,
  getPropertyExpertsFromDB,
  geUserByIdFromDB,
  changeUserStatusFromDB,
  changeUserNotifyFromDB,
  updateUserInfoFromDB,
  updateLocationFromDB,
  deleteAUserFromDB,
  deleteUserProfileByAdminFromDB,
  updateVatInfoFromDB,
  adjustUserPointsFromDB,
}

