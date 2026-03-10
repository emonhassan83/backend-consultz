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

const getAllUsersFromDB = async (query: Record<string, unknown>, currentUserId: string) => {
  let baseQuery: FilterQuery<TUser> = {
    isDeleted: false,
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
  };

  // Apply all your filters (unchanged)
  if (query.priceRange) {
    const [minStr, maxStr] = (query.priceRange as string).split('-');
    const min = Number(minStr);
    const max = Number(maxStr);
    if (!isNaN(min) && !isNaN(max)) {
      baseQuery.hourlyRate = { $gte: min, $lte: max };
    }
  }

  if (query.interests) {
    const interests = (query.interests as string).split(',');
    baseQuery.interests = { $in: interests.map(i => i.trim()) };
  }

  if (query.learningStyles) {
    const styles = (query.learningStyles as string).split(',');
    baseQuery.learningStyles = { $in: styles.map(s => s.trim()) };
  }

  if (query.availability) {
    const days = (query.availability as string).split(',');
    baseQuery['availability.day'] = { $in: days.map(d => d.trim().toLowerCase()) };
  }

  if (query.rating) {
    const [minRatingStr, maxRatingStr] = (query.rating as string).split(',');
    const minRating = Number(minRatingStr);
    const maxRating = Number(maxRatingStr) || Infinity;
    if (!isNaN(minRating)) {
      baseQuery.avgRating = { $gte: minRating };
      if (isFinite(maxRating)) {
        baseQuery.avgRating.$lte = maxRating;
      }
    }
  }

  if (query.sessionDurations) {
    const durations = (query.sessionDurations as string)
      .split(',')
      .map(d => Number(d.trim()))
      .filter(n => !isNaN(n));

    if (durations.length > 0) {
      baseQuery['sessionDurations.duration'] = { $in: durations };
    }
  }

  const usersQuery = new QueryBuilder(
    User.find(baseQuery).select(
      '_id id firstName lastName email phoneNumber photoUrl headline following followers points avgRating skills languages expertise status isProfileSetup createdAt hourlyRate sessionDurations availability interests learningStyles'
    ),
    query,
  )
    .search(['firstName', 'lastName'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const experts = await usersQuery.modelQuery;
  const meta = await usersQuery.countTotal();

  // Batch fetch isFollowing & totalBookings
  const expertIds = experts.map(e => e._id.toString());
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(currentUserId, expertIds),
    getTotalBookingsBatch(expertIds),
  ]);

  // Enrich result
  const enrichedResult = experts.map(expert => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }));

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
  ]);

  const activeConsult = activeCounts.find(item => item._id === USER_ROLE.consult)?.count || 0;
  const activeExpert = activeCounts.find(item => item._id === USER_ROLE.expert)?.count || 0;

  return {
    meta,
    data: {
      totalUsers: meta.total,
      activeConsult,
      activeExpert,
      userList: enrichedResult,
    },
  };
};

// 1. Interest-based experts
const getInterestExpertsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const currentUser = await User.findById(userId).select('interests');
  if (!currentUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const { interests } = currentUser;

  const matchConditions: any[] = [];
  if (interests?.length) {
    matchConditions.push({ interests: { $in: interests } });
  }

  const baseFilter = {
    _id: { $ne: new Types.ObjectId(userId) },
    isDeleted: false,
    status: USER_STATUS.active,
    role: USER_ROLE.expert,
    $or: matchConditions,
  };

  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount'
    ),
    query,
  )
    .sort()
    .paginate()
    .fields();

  const experts = await usersQuery.modelQuery;

  // Batch isFollowing + totalBookings
  const expertIds = experts.map(e => e._id.toString());
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ]);

  const result = experts.map(expert => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }));

  const meta = await usersQuery.countTotal();

  return { meta, result };
};

// 2. Property experts
const getPropertyExpertsFromDB = async (userId: string, query: Record<string, unknown>) => {
  const filter = {
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { expertise: { $in: ['Property & Real Estate'] } },
      { skills: { $in: PROPERTY_SKILLS } },
    ],
  };

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount'
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      points: -1,
    })
    .paginate()
    .fields();

  const experts = await usersQuery.modelQuery;

 // Batch isFollowing + totalBookings
  const expertIds = experts.map(e => e._id.toString());
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ]);

  const result = experts.map(expert => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }));

  const meta = await usersQuery.countTotal();

  return { meta, result };
};

// 3. Top experts
const getTopExpertsFromDB = async (userId: string, query: Record<string, unknown>) => {
  const filter = {
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    avgRating: { $gte: 4 },
  };

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline avgRating ratingCount followers'
    ),
    query,
  )
    .sortByCustom({
      avgRating: -1,
      ratingCount: -1,
      followers: -1,
    })
    .paginate()
    .fields();

  const experts = await usersQuery.modelQuery;

  // Batch isFollowing + totalBookings
  const expertIds = experts.map(e => e._id.toString());
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ]);

  const result = experts.map(expert => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }));

  const meta = await usersQuery.countTotal();

  return { meta, result };
};

// 4. Investment experts
const getInvestmentExperts = async (userId: string, query: Record<string, unknown>) => {
  const filter = {
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { expertise: { $in: ['Property Investment & Development'] } },
      { skills: { $in: INVESTMENT_SKILLS } },
    ],
  };

  const queryBuilder = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline avgRating ratingCount followers'
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
    .fields();

  const experts = await queryBuilder.modelQuery;

  // Batch isFollowing + totalBookings
  const expertIds = experts.map(e => e._id.toString());
  const [followingMap, totalBookingsMap] = await Promise.all([
    getFollowingStatusBatch(userId, expertIds),
    getTotalBookingsBatch(expertIds),
  ]);

  const result = experts.map(expert => ({
    ...expert.toObject(),
    isFollowing: followingMap.get(expert._id.toString()) || false,
    totalBookings: totalBookingsMap.get(expert._id.toString()) || 0,
  }));

  const meta = await queryBuilder.countTotal();

  return { meta, result };
};

const geUserByIdFromDB = async (viewerId: string, viewedUserId: string) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch the viewed user
    const user = await User.findById(viewedUserId)
      .select(
        '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline following followers points referralCode socialProfiles hourlyRate priceRange interests learningStyles availability bankDetails advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability role languages education isTopExpert pushNotify emailNotify status createdAt'
      )
      .lean();

    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
    }

    // 2. Skip view count for the user's own profile
    if (viewerId === viewedUserId) {
      // No view count increment for self-view
    } else {
      // 3. Increment profile view count (only once per unique viewer)
      await ProfileView.findOneAndUpdate(
        {
          viewer: viewerId,
          viewedUser: viewedUserId,
        },
        {
          $setOnInsert: { viewedAt: new Date() }, // only create if not exists
        },
        {
          upsert: true,
          new: true,
          session,
        }
      );
    }

    // 4. Calculate other stats (unchanged)
    const referralLink = `${config.client_url}/signup?ref=${user.referralCode}`;

    const completedBookingsCount = await Booking.countDocuments({
      consult: viewedUserId,
      status: BOOKING_STATUS.completed,
    });

    let advisingTimeInHours = 0;
    if (user.role === USER_ROLE.expert) {
      const totalMinutesResult = await Booking.aggregate([
        { $match: { consult: viewedUserId, status: BOOKING_STATUS.completed } },
        { $group: { _id: null, totalMinutes: { $sum: '$sessionDuration' } } },
      ]);

      const minutes = totalMinutesResult[0]?.totalMinutes || 0;
      advisingTimeInHours = Number((minutes / 60).toFixed(2));
    }

    const totalBookingsCountAll = await Booking.countDocuments({ consult: viewedUserId });
    const avgAttendance =
      totalBookingsCountAll > 0
        ? Math.min(Math.round((completedBookingsCount / totalBookingsCountAll) * 100), 100)
        : 0;

    const profileSetupProgress = calculateProfileSetupProgress(user);

    const isFollowing = await Follow.exists({
      follower: viewerId,
      following: viewedUserId,
    });

    // 5. Get total unique profile views (for display)
    const profileViewCount = await ProfileView.countDocuments({
      viewedUser: viewedUserId,
    });

    await session.commitTransaction();

    return {
      ...user,
      referralLink,
      totalBookings: completedBookingsCount,
      profileSetupProgress,
      advisingTimeInHours,
      avgAttendance,
      isFollowing: !!isFollowing,
      profileViewCount, // ← New field: total unique views
    };
  } catch (error) {
    await session.abortTransaction();
    throw error instanceof AppError
      ? error
      : new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch user profile');
  } finally {
    session.endSession();
  }
};

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
        message: 'Expert Account Approved!',
        description: `You have earned 300 points. Start accepting bookings now! 🎉`,
      })
    }
  }

  // 4. notify to admin and user
  await sendUserStatusNotifYToUser(status, updatedUser)
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

    // Step 1: Handle session durations logic (unchanged)
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

    // Step 2: Social profile addition reward (only for expert, one-time)
    const isExpert = user.role === USER_ROLE.expert

    if (
      isExpert &&
      payload.socialProfiles &&
      payload.socialProfiles.length > 0
    ) {
      // Check if this is the FIRST time socialProfiles are being added
      const previouslyEmpty =
        !user.socialProfiles || user.socialProfiles.length === 0

      if (previouslyEmpty) {
        // Award 150 points (one-time)
        user.points = (user.points || 0) + 150
        finalPayload.points = user.points

        // Mark that this reward has been claimed (prevents multiple claims)
        finalPayload.socialProofBonusClaimed = true

        // Send push notification if enabled
        if (user.fcmToken && user.pushNotify?.points) {
          await sendNotification([user.fcmToken], {
            message: 'Social Profiles Added!',
            description:
              'Congratulations! You earned 150 points for adding your social profiles. 🎉',
          })
        }
      }
    }

    // Step 3: Existing profile completion bonus logic (role-based, unchanged)
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
            message: 'Profile Completed!',
            description: `Congratulations! You have earned ${pointsToAdd} points for fully completing your ${isExpert ? 'expert' : 'consult'} profile. 🎉`,
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
      '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline following followers points socialProfiles hourlyRate bankDetails advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability status createdAt role profileCompletionBonusClaimed socialProfileBonusClaimed',
    )

    if (!updatedUser) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'User not found and failed to update!',
      )
    }

    await session.commitTransaction()
    return updatedUser
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
