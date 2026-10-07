import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TUser } from './user.interface'
import { User } from './user.model'
import QueryBuilder from '../../builder/QueryBuilder'
import {
  INVESTMENT_SKILLS,
  PROPERTY_SKILLS,
  TUserStatus,
  USER_ROLE,
  USER_STATUS,
} from './user.constant'
import {
  assertUserCanDeleteProfile,
  calculateProfileSetupProgress,
  generateUserStatusEmail,
  getFollowingStatusBatch,
  getCancellationRates,
  getTotalBookingsBatch,
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

const applyReferralCodeToUser = async (userId: string, referralCode: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const user = await User.findById(userId).session(session)
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    if (user.referredBy) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Referral code already used')
    }

    const referrer = await User.findOne({ referralCode }).session(session)
    if (!referrer) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid referral code')
    }

    if (referrer._id.toString() === user._id.toString()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cannot use your own referral code',
      )
    }

    user.referredBy = referrer._id
    user.points = (user.points || 0) + 500
    referrer.points = (referrer.points || 0) + 500

    await Promise.all([
      user.save({ session }),
      referrer.save({ session }),
      createPointsLog(
        user._id,
        500,
        'Referral code reward for using a valid referral code',
        POINTS_LOG_SOURCE.reword,
        POINTS_LOG_TYPE.credit,
        session,
      ),
      createPointsLog(
        referrer._id,
        500,
        'Referral reward for inviting a new user',
        POINTS_LOG_SOURCE.reword,
        POINTS_LOG_TYPE.credit,
        session,
      ),
    ])

    await session.commitTransaction()

    return {
      _id: user._id,
      referredBy: user.referredBy,
      points: user.points,
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
  payload: TUser & { referralCode?: string },
) => {
  const { email, password, referralCode, ...rest } = payload
  const userPayload = { ...rest, email, password }
  const applyReferralAndReturnUser = async (userId: string) => {
    if (!referralCode) return null

    await applyReferralCodeToUser(userId, referralCode)
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

  const existingUser = await User.findOne({ email })
  if (existingUser) {
    // Soft deleted user — recreate
    if (existingUser.isDeleted) {
      existingUser.set({ ...userPayload, isDeleted: false })
      const user = await existingUser.save()
      const updatedUser = await applyReferralAndReturnUser(user._id.toString())
      if (updatedUser) return updatedUser
      return user
    }

    // Unverified user — update fields and re-save
    if (!existingUser.verification?.status) {
      existingUser.set({ ...userPayload })
      const user = await existingUser.save()
      const updatedUser = await applyReferralAndReturnUser(user._id.toString())
      if (updatedUser) return updatedUser
      return user
    }
    if (!existingUser.isPhoneOtpVerified) {
      existingUser.set({ ...userPayload })
      const user = await existingUser.save()
      const updatedUser = await applyReferralAndReturnUser(user._id.toString())
      if (updatedUser) return updatedUser
      return user
    }

    // Already active user
    throw new AppError(
      httpStatus.FORBIDDEN,
      `A ${existingUser.role} account already exists with this email. Please use a different email.`,
    )
  }

  if (!payload.password) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password is required')
  }

  if (referralCode) {
    const referrer = await User.findOne({ referralCode }).select('_id')
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

const getAllUsersFromDB = async (
  query: Record<string, unknown>,
  currentUserId: string,
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

  const usersQuery = new QueryBuilder(
    User.find(baseQuery).select(
      '_id id firstName lastName email phoneNumber photoUrl role headline following followers points avgRating skills languages expertise status isProfileSetup createdAt hourlyRate sessionDurations availability interests learningStyles',
    ),
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

  const enrichedResult = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))

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
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate',
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

  const result = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))

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
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      points: -1,
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

  const result = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))

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
      '_id firstName lastName photoUrl headline avgRating ratingCount followers hourlyRate',
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

  const result = experts.map((expert) => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }))

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
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      points: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  const result = experts.map((expert: any) => ({
    ...expert.toObject(),
    isFollowing: false, // non-auth user → always false
    totalBookings: 0, // non-auth → hide sensitive count
  }))

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
      '_id firstName lastName photoUrl headline followers avgRating ratingCount hourlyRate',
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      points: -1,
    })
    .paginate()
    .fields()

  const experts = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  const result = experts.map((expert: any) => ({
    ...expert.toObject(),
    isFollowing: false,
    totalBookings: 0,
  }))

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
      '_id firstName lastName photoUrl headline avgRating ratingCount followers hourlyRate',
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

  const result = experts.map((expert: any) => ({
    ...expert.toObject(),
    isFollowing: false,
    totalBookings: 0,
  }))

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

const enrichSessionDurationsWithPrice = (
  sessionDurations: any[],
  hourlyRate: number,
) => {
  return sessionDurations.map((session) => ({
    ...session,
    price:
      session.offeredPrice > 0
        ? session.offeredPrice
        : parseFloat(((hourlyRate / 60) * session.duration).toFixed(2)),
  }))
}

const geUserByIdFromDB = async (viewerId: string, viewedUserId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const user = await User.findById(viewedUserId)
      .select(
        '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline points referralCode socialProfiles hourlyRate priceRange interests learningStyles availability advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability role languages education stripeAccountId isTopExpert pushNotify emailNotify isVatRegistered vatRegistrationNumber country status createdAt bookingRules lastLogAt',
      )
      .lean()

    if (!user || user.isDeleted)
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')

    if (viewerId !== viewedUserId) {
      await ProfileView.findOneAndUpdate(
        { viewer: viewerId, viewedUser: viewedUserId },
        { $setOnInsert: { viewedAt: new Date() } },
        { upsert: true, returnDocument: 'after', session },
      )
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

    await session.commitTransaction()

    return {
      ...user,
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
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to fetch user profile',
      )
  } finally {
    session.endSession()
  }
}

const changeUserStatusFromDB = async (payload: {
  userId: string
  status: TUserStatus
}) => {
  const { userId, status } = payload

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
    // Award 300 points to the expert
    const pointsToAdd = 300
    updatedUser.points = (updatedUser.points || 0) + pointsToAdd
    await updatedUser.save()
    await createPointsLog(
      updatedUser._id,
      pointsToAdd,
      'Expert account approval reward',
    )

    // Send push notification to expert (if enabled)
    if (updatedUser.fcmToken && updatedUser.pushNotify?.points) {
      await sendNotification([updatedUser.fcmToken], {
        receiver: updatedUser._id,
        message: 'Expert Account Approved!',
        description: `You have earned 300 points. Start accepting bookings now! 🎉`,
        reference: updatedUser._id,
        modelType: modeType.Achievement,
      })
    }
  }

  // 4. notify to admin and user
  // await sendUserStatusNotifYToUser(status, updatedUser)
  await sendUserStatusNotifYToAdmin(status, updatedUser)

  // 5. Blocked or Active email sent to user
  if (status === USER_STATUS.blocked || status === USER_STATUS.active) {
    await generateUserStatusEmail(user, status)
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

    let finalPayload = { ...payload }

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

    // Step 1: Session durations logic
    if (payload.sessionDurations && payload.sessionDurations.length > 0) {
      const effectiveHourlyRate =
        payload.hourlyRate !== undefined ? payload.hourlyRate : user.hourlyRate

      if (effectiveHourlyRate <= 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Hourly rate must be greater than 0 to update session durations.',
        )
      }

      const updatedDurations = payload.sessionDurations.map((item) => ({
        ...item,
        offeredPrice: Number(
          ((item.duration / 60) * effectiveHourlyRate).toFixed(2),
        ),
      }))

      finalPayload = {
        ...payload,
        sessionDurations: updatedDurations,
        hourlyRate: effectiveHourlyRate,
      }
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
        user.points = (user.points || 0) + 150
        finalPayload.points = user.points
        finalPayload.socialProofBonusClaimed = true
        await createPointsLog(
          user._id,
          150,
          'Social profile addition reward',
          POINTS_LOG_SOURCE.reword,
          POINTS_LOG_TYPE.credit,
          session,
        )

        if (user.fcmToken && user.pushNotify?.points) {
          await sendNotification([user.fcmToken], {
            receiver: user._id,
            message: 'Social Profiles Added!',
            description:
              'Congratulations! You earned 150 points for adding your social profiles. 🎉',
            reference: user._id,
            modelType: modeType.Achievement,
          })
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
        (payload as any)[field] !== undefined
          ? (payload as any)[field]
          : (user as any)[field]

      if (Array.isArray(value)) return value.length > 0
      return value !== undefined && value !== null && value !== ''
    })

    if (isProfileNowComplete && !user.profileCompletionBonusClaimed) {
      const pointsToAdd = isExpert ? 300 : isConsult ? 150 : 0

      if (pointsToAdd > 0) {
        user.points = (user.points || 0) + pointsToAdd
        finalPayload.points = user.points
        finalPayload.profileCompletionBonusClaimed = true
        await createPointsLog(
          user._id,
          pointsToAdd,
          `${isExpert ? 'Expert' : 'Consult'} profile completion reward`,
          POINTS_LOG_SOURCE.reword,
          POINTS_LOG_TYPE.credit,
          session,
        )

        if (user.fcmToken && user.pushNotify?.points) {
          await sendNotification([user.fcmToken], {
            receiver: user._id,
            message: 'Profile Completed!',
            description: `Congratulations! You have earned ${pointsToAdd} points for fully completing your ${isExpert ? 'expert' : 'consult'} profile. 🎉`,
            reference: user._id,
            modelType: modeType.Achievement,
          })
        }
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
      { isDeleted: true },
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

export const UserService = {
  registerUserIntoDB,
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

