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
  calculateProfileSetupProgress,
  generateUserStatusEmail,
  getFollowingStatusBatch,
  getTotalBookingsBatch,
  sendUserStatusNotifYToAdmin,
  sendUserStatusNotifYToUser,
} from './user.utils'
import mongoose, { FilterQuery, Types } from 'mongoose'
import { Booking } from '../booking/booking.models'
import { BOOKING_STATUS } from '../booking/booking.constants'
import config from '../../config'
import { sendNotification } from '../../utils/sentNotification'
import { Follow } from '../connection/connection.models'
import { ProfileView } from '../profileView/profileView.model'
import dayjs from 'dayjs'
import { Withdraw } from '../withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'
import { modeType } from '../notification/notification.interface'

const registerUserIntoDB = async (
  payload: TUser & { referralCode?: string },
) => {
  const { email, password, referralCode, ...rest } = payload

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
      existingUser.set({ ...payload, isDeleted: false })
      const user = await existingUser.save()
      return user
    }

    // Unverified user — update fields and re-save
    if (!existingUser.verification?.status) {
      existingUser.set({ ...payload })
      const user = await existingUser.save()
      return user
    }

    // Already active user
    throw new AppError(
      httpStatus.FORBIDDEN,
      'User already exists with this email',
    )
  }

  if (!payload.password) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password is required')
  }

  const finalPayload = {
    ...rest,
    email,
    password,
    status:
      payload.role === USER_ROLE.expert
        ? USER_STATUS.pending
        : payload.status || USER_STATUS.active,
  }

  const newUser = await User.create(finalPayload)

  // Referral logic: if exist
  let referredBy = null
  if (referralCode) {
    const referrer = await User.findOne({ referralCode })
    if (referrer && referrer._id.toString() !== newUser._id.toString()) {
      // Self-referral block
      referredBy = referrer._id
      newUser.referredBy = referredBy
      await newUser.save()

      // Points add
      referrer.points += 500 // referrer gets 500 points
      await referrer.save()

      newUser.points += 500 //new user gets 500 bonus
      await newUser.save()
    } else if (referrer) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cannot use your own referral code',
      )
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid referral code')
    }
  }

  return newUser
}

const getAllUsersFromDB = async (
  query: Record<string, unknown>,
  currentUserId: string,
) => {
  // Base filter — সবসময় apply হবে
  const mustMatch: FilterQuery<TUser> = {
    isDeleted: false,
    role: { $ne: USER_ROLE.admin },
    status: USER_STATUS.active,
  }

  // Optional conditions — যেকোনো একটা match করলেই চলবে
  const orConditions: FilterQuery<TUser>[] = []

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
      orConditions.push({ interests: { $in: interests } })
    }
    delete query.interests
  }

  if (query.learningStyles) {
    const styles = (query.learningStyles as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (styles.length > 0) {
      orConditions.push({ learningStyles: { $in: styles } })
    }
    delete query.learningStyles
  }

  if (query.availability) {
    const days = (query.availability as string)
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
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
  const baseQuery: FilterQuery<TUser> =
    orConditions.length > 0 ? { ...mustMatch, $or: orConditions } : mustMatch

  const usersQuery = new QueryBuilder(
    User.find(baseQuery).select(
      '_id id firstName lastName email phoneNumber photoUrl role headline following followers points avgRating skills languages expertise status isProfileSetup createdAt hourlyRate sessionDurations availability interests learningStyles',
    ),
    query,
  )
    .search(['firstName', 'lastName'])
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
      matchConditions.push({ expertise: { $in: expertise } })
    }
  } else {
    if (interests?.length) {
      matchConditions.push({ expertise: { $in: interests } })
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
      '_id firstName lastName photoUrl headline followers avgRating ratingCount',
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
      '_id firstName lastName photoUrl headline followers avgRating ratingCount',
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
      '_id firstName lastName photoUrl headline avgRating ratingCount followers',
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
        '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline following followers points referralCode socialProfiles hourlyRate priceRange interests learningStyles availability bankDetails advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability role languages education isTopExpert pushNotify emailNotify status createdAt',
      )
      .lean()

    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    if (viewerId !== viewedUserId) {
      await ProfileView.findOneAndUpdate(
        {
          viewer: viewerId,
          viewedUser: viewedUserId,
        },
        {
          $setOnInsert: { viewedAt: new Date() },
        },
        {
          upsert: true,
          new: true,
          session,
        },
      )
    }

    let referralLink = ''
    if (user.referralCode) {
      referralLink = `${config.app_url}/signup?ref=${user.referralCode}`
    }

    const deeplink = `consultz://profile/${viewedUserId}`;

    const last7Days = dayjs().subtract(7, 'day').toDate()

    const [
      completedBookingsCount,
      totalBookingsCountAll,
      profileViewCount,
      isFollowing,
      totalWithdrawResult,
      pendingWithdrawResult,
      last7DaysFollowersCount, // ✅
      totalFollowersCount, // ✅
    ] = await Promise.all([
      Booking.countDocuments({
        consult: viewedUserId,
        status: BOOKING_STATUS.completed,
      }),
      Booking.countDocuments({ consult: viewedUserId }),
      ProfileView.countDocuments({
        viewedUser: viewedUserId,
        viewedAt: { $gte: last7Days },
      }),
      Follow.exists({
        follower: viewerId,
        following: viewedUserId,
      }),
      // ✅ completed withdraw total amount
      Withdraw.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(viewedUserId),
            status: WITHDRAW_STATUS.completed,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]),
      // ✅ proceed + hold withdraw
      Withdraw.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(viewedUserId),
            status: { $in: [WITHDRAW_STATUS.proceed, WITHDRAW_STATUS.hold] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]),

      // last 7 days new followers
      Follow.countDocuments({
        following: viewedUserId,
        createdAt: { $gte: last7Days },
      }),
      // total followers
      Follow.countDocuments({
        following: viewedUserId,
      }),
    ])

    const totalWithdraw = totalWithdrawResult[0]?.total || 0
    const pendingWithdraw = pendingWithdrawResult[0]?.total || 0

    // Growth rate calculate
    const followerGrowthRate =
      totalFollowersCount > 0
        ? parseFloat(
            ((last7DaysFollowersCount / totalFollowersCount) * 100).toFixed(2),
          )
        : 0

    let advisingTimeInHours = 0
    if (user.role === USER_ROLE.expert) {
      const totalMinutesResult = await Booking.aggregate([
        { $match: { consult: viewedUserId, status: BOOKING_STATUS.completed } },
        { $group: { _id: null, totalMinutes: { $sum: '$sessionDuration' } } },
      ])

      const minutes = totalMinutesResult[0]?.totalMinutes || 0
      advisingTimeInHours = Number((minutes / 60).toFixed(2))
    }

    const avgAttendance =
      totalBookingsCountAll > 0
        ? Math.min(
            Math.round((completedBookingsCount / totalBookingsCountAll) * 100),
            100,
          )
        : 0

    const profileSetupProgress = calculateProfileSetupProgress(user)

    const sessionDurationsWithPrice = enrichSessionDurationsWithPrice(
      user.sessionDurations || [],
      user.hourlyRate || 0,
    )

    await session.commitTransaction()

    return {
      ...user,
      sessionDurations: sessionDurationsWithPrice,
      referralLink,
      deeplink,
      totalBookings: completedBookingsCount,
      profileSetupProgress,
      advisingTimeInHours,
      avgAttendance,
      isFollowing: !!isFollowing,
      profileViewCount,
      totalWithdraw,
      pendingWithdraw,
      followerGrowthRate,
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
    { new: true },
  ).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline status createdAt',
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

    // Send push notification to expert (if enabled)
    if (updatedUser.fcmToken && updatedUser.pushNotify?.points) {
      await sendNotification([updatedUser.fcmToken], {
        receiver: updatedUser._id,
        message: 'Expert Account Approved!',
        description: `You have earned 300 points. Start accepting bookings now! 🎉`,
        reference: updatedUser._id,
        modelType: modeType.User,
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
    new: true,
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

    // Step 1: Handle session durations logic
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

        if (user.fcmToken && user.pushNotify?.points) {
          await sendNotification([user.fcmToken], {
            receiver: user._id,
            message: 'Social Profiles Added!',
            description:
              'Congratulations! You earned 150 points for adding your social profiles. 🎉',
              reference: user._id,
              modelType: modeType.User,
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

      if (Array.isArray(value)) {
        return value.length > 0
      }

      return value !== undefined && value !== null && value !== ''
    })

    if (isProfileNowComplete && !user.profileCompletionBonusClaimed) {
      const pointsToAdd = isExpert ? 300 : isConsult ? 150 : 0

      if (pointsToAdd > 0) {
        user.points = (user.points || 0) + pointsToAdd
        finalPayload.points = user.points
        finalPayload.profileCompletionBonusClaimed = true

        if (user.fcmToken && user.pushNotify?.points) {
          await sendNotification([user.fcmToken], {
            receiver: user._id,
            message: 'Profile Completed!',
            description: `Congratulations! You have earned ${pointsToAdd} points for fully completing your ${isExpert ? 'expert' : 'consult'} profile. 🎉`,
            reference: user._id,
            modelType: modeType.User,
          })
        }
      }
    }

    // Step 4: Apply the final update
    const updatedUser = await User.findByIdAndUpdate(userId, finalPayload, {
      new: true,
      runValidators: true,
      session,
    }).select(
      '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline following followers points socialProfiles hourlyRate bankDetails advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability status createdAt role profileCompletionBonusClaimed socialProofBonusClaimed',
    )

    if (!updatedUser) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'User not found and failed to update!',
      )
    }

    await session.commitTransaction()

    // 🔥 Calculate profile progress after update (without saving to DB)
    const profileSetupProgress = calculateProfileSetupProgress(updatedUser)

    // 🎯 Return user data with calculated progress
    return {
      ...updatedUser.toObject(),
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
    { new: true },
  ).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto status createdAt',
  )

  return result
}

const deleteAUserFromDB = async (userId: string) => {
  //* Check if the user exists
  const user = await User.findById(userId).select('_id')
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  // Use `Promise.all` to execute updates in parallel
  const result = await User.findByIdAndUpdate(
    userId,
    { isDeleted: true },
    { new: true },
  ).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto status createdAt',
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Failed to update user status!')
  }

  return result
}

export const UserService = {
  registerUserIntoDB,
  getAllUsersFromDB,
  getInvestmentExperts,
  getInterestExpertsFromDB,
  getTopExpertsFromDB,
  getPropertyExpertsFromDB,
  geUserByIdFromDB,
  changeUserStatusFromDB,
  changeUserNotifyFromDB,
  updateUserInfoFromDB,
  updateLocationFromDB,
  deleteAUserFromDB,
}
