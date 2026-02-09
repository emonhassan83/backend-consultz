import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TUser } from './user.interface'
import { User } from './user.model'
import QueryBuilder from '../../builder/QueryBuilder'
import {
  PROPERTY_EXPERTISE,
  PROPERTY_SKILLS,
  USER_ROLE,
  USER_STATUS,
} from './user.constant'
import {
  calculateProfileSetupProgress,
  sendUserStatusNotifYToAdmin,
  sendUserStatusNotifYToUser,
} from './user.utils'
import { Types } from 'mongoose'
import { Booking } from '../booking/booking.models'
import { BOOKING_STATUS } from '../booking/booking.constants'

const registerUserIntoDB = async (payload: TUser) => {
  if (payload.role === 'admin') {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You cannot directly assign admin role',
    )
  }

  const existingUser = await User.findOne({ email: payload.email })
  if (existingUser) {
    // 🟡 Soft deleted user — recreate
    if (existingUser.isDeleted) {
      existingUser.set({ ...payload, isDeleted: false })
      const user = await existingUser.save()
      return user
    }

    // 🟡 Unverified user — update fields and re-save
    if (!existingUser.verification?.status) {
      existingUser.set({ ...payload })
      const user = await existingUser.save()
      return user
    }

    // 🔴 Already active user
    throw new AppError(
      httpStatus.FORBIDDEN,
      'User already exists with this email',
    )
  }

  // 🟢 New user
  if (!payload.password) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password is required')
  }

  const finalPayload = {
    ...payload,
    status:
      payload.role === USER_ROLE.expert
        ? USER_STATUS.pending
        : payload.status || USER_STATUS.active,
  }

  const newUser = new User(finalPayload)

  await newUser.save()

  return newUser
}

const getAllUsersFromDB = async (query: Record<string, unknown>) => {
  const usersQuery = new QueryBuilder(
    User.find({ isDeleted: false, role: { $ne: USER_ROLE.admin } }).select(
      '_id id firstName lastName email phoneNumber photoUrl headline following followers points avgRating skills languages expertise status isProfileSetup createdAt',
    ),
    query,
  )
    .search(['firstName', 'lastName'])
    .filter()
    .sort()
    .paginate()
    .fields()

  // 3. Get counts for active consult and expert (independent of pagination)
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

  // Extract counts safely
  const activeConsult =
    activeCounts.find((item) => item._id === USER_ROLE.consult)?.count || 0
  const activeExpert =
    activeCounts.find((item) => item._id === USER_ROLE.expert)?.count || 0

  const result = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  return {
    meta,
    data: {
      totalUsers: meta.total,
      activeConsult,
      activeExpert,
      userList: result,
    },
  }
}

const getInterestExpertsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  // 1️⃣ Get current user
  const currentUser = await User.findById(userId).select('interests')
  if (!currentUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const { interests } = currentUser

  // 2️⃣ Build interest matching logic
  const matchConditions: any[] = []
  if (interests?.length) {
    matchConditions.push({ interests: { $in: interests } })
  }

  // 3️⃣ Base expert filter
  const baseFilter = {
    _id: { $ne: new Types.ObjectId(userId) },
    isDeleted: false,
    status: USER_STATUS.active,
    role: USER_ROLE.expert,
    $or: matchConditions,
  }

  // 4️⃣ Query Builder (same standard you already use)
  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount',
    ),
    query,
  )
    .sort()
    .paginate()
    .fields()

  const result = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  return {
    meta,
    result,
  }
}

const getPropertyExpertsFromDB = async (query: Record<string, unknown>) => {
  const filter = {
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,

    // 🎯 4-Level Taxonomy based on matching
    $or: [
      // Level 1 + Level 4 → Domain + Specialism
      {
        expertise: {
          $in: PROPERTY_EXPERTISE,
        },
      },

      // Level 3 + Level 4 → Role + Specialism
      {
        expertise: {
          $in: [
            'Property Strategy Coaches',
            'Property Deal Mentors',
            'Property Systems Consultants',
            'Property Marketing Advisors',
          ],
        },
      },

      // Level 2 → Service Type level
      {
        expertise: {
          $in: ['Property Education & Mentoring', 'Property Business Coaching'],
        },
      },

      // Skills level
      {
        skills: {
          $in: PROPERTY_SKILLS,
        },
      },
    ],
  }

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id firstName lastName photoUrl headline followers avgRating ratingCount',
    ),
    query,
  )
    // sorting
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      points: -1,
    })
    .paginate()
    .fields()

  const result = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  return { meta, result }
}

const getTopExpertsFromDB = async (query: Record<string, unknown>) => {
  const filter = {
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

  const result = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  return { meta, result }
}

const getInvestmentExperts = async (query: Record<string, unknown>) => {
  const filter = {
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,

    // Fixed categories only — no query params dependency
    $or: [
      {
        expertise: {
          $in: [
            'Property Investment & Development',
            'Buy to Let',
            'HMOs',
            'Rent to Rent',
            'Sourcing',
            'Negotiation',
            'Deal Structuring',
            'Lead Generation',
            'Deal Pipelines',
            'Investor Branding',
            'Deal Packaging',
          ],
        },
      },
      {
        expertise: {
          $in: [
            'Property Strategy Coaches',
            'Property Deal Mentors',
            'Property Systems Consultants',
            'Property Marketing Advisors',
          ],
        },
      },
      {
        expertise: {
          $in: ['Property Education & Mentoring', 'Property Business Coaching'],
        },
      },
      {
        skills: {
          $in: [
            'Real Estate',
            'Property Law',
            'Investment',
            'Real Estate Development',
            'Buy-to-Let Strategy',
            'HMO Management',
            'Rent-to-Rent',
            'Property Sourcing',
            'Property Negotiation',
            'Deal Packaging',
            'Property Lead Generation',
            'Investor Marketing',
            'Property Systems',
            'Real Estate Marketing',
          ],
        },
      },
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

  const result = await queryBuilder.modelQuery
  const meta = await queryBuilder.countTotal()

  return { meta, result }
}

const geUserByIdFromDB = async (id: string) => {
  const user = await User.findById(id)
    .select(
      '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline following followers points socialProfiles hourlyRate priceRange interests learningStyles availability bankDetails advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability status createdAt role'
    )
    .lean();
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  // Total bookings (all statuses)
  const totalBookingsCount = await Booking.countDocuments({
    consult: id,
  });

  // Completed bookings only
  const completedBookingsCount = await Booking.countDocuments({
    consult: id,
    status: BOOKING_STATUS.completed,
  });

  // Advising time in hours (only for expert role)
  let advisingTimeInHours = 0;
  if (user.role === USER_ROLE.expert) {
    const totalMinutesResult = await Booking.aggregate([
      {
        $match: {
          consult: id,
          status: BOOKING_STATUS.completed,
        },
      },
      {
        $group: {
          _id: null,
          totalMinutes: { $sum: '$sessionDuration' },
        },
      },
    ]);

    const minutes = totalMinutesResult[0]?.totalMinutes || 0;
    advisingTimeInHours = Number((minutes / 60).toFixed(2));
  }

  // Average attendance percentage
  const avgAttendance = totalBookingsCount > 0
    ? Math.min(
        Math.round((completedBookingsCount / totalBookingsCount) * 100),
        100
      )
    : 0;

  const profileSetupProgress = calculateProfileSetupProgress(user);

  return {
    ...user,
    totalBookings: completedBookingsCount, // or totalBookingsCount if you want all
    profileSetupProgress,
    advisingTimeInHours,
    avgAttendance,
  };
};

const changeUserStatusFromDB = async (payload: any) => {
  const { userId, status } = payload

  //* if the user is is not exist
  const user = await User.findById(userId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const updateUserStatus = await User.findByIdAndUpdate(
    userId,
    { status },
    { new: true },
  ).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline status createdAt',
  )
  if (!updateUserStatus) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User not found and failed to update status!',
    )
  }

  // Send notification to both user and admin
  await sendUserStatusNotifYToUser(status, updateUserStatus)
  await sendUserStatusNotifYToAdmin(status, updateUserStatus)

  return updateUserStatus
}

const changeUserNotifyFromDB = async (id: string, payload: any) => {
  // 1️⃣ Validate user
  const user = await User.findById(id)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  // 4️⃣ Update user
  const updatedUser = await User.findByIdAndUpdate(id, payload, {
    new: true,
  }).select(
    '_id id firstName lastName email photoUrl headline status createdAt pushNotify emailNotify',
  )

  if (!updatedUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User not found and failed to update notification settings!',
    )
  }

  return updatedUser
}

const updateUserInfoFromDB = async (
  userId: string,
  payload: Partial<TUser>,
) => {
  //* if the user is is not exist
  const user = await User.findById(userId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const updatedUser = await User.findByIdAndUpdate(userId, payload, {
    new: true,
  }).select(
    '_id id firstName lastName email phoneNumber photoUrl bio coverPhoto headline following followers points socialProfiles hourlyRate bankDetails advisingTime advisingStyles timeZone sessionDurations avgRating skills languages expertise availability status createdAt',
  )
  if (!updatedUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User not found and failed to update!',
    )
  }

  return updatedUser
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
