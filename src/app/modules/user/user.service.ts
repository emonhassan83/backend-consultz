import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TUser } from './user.interface'
import { User } from './user.model'
import QueryBuilder from '../../builder/QueryBuilder'
import { USER_ROLE, USER_STATUS } from './user.constant'
import {
  sendUserStatusNotifYToAdmin,
  sendUserStatusNotifYToUser,
} from './user.utils'
import { FilterQuery, Types } from 'mongoose'

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
  };

  const newUser = new User(finalPayload);

  await newUser.save()

  return newUser
}

const getAllUsersFromDB = async (query: Record<string, unknown>) => {
  const usersQuery = new QueryBuilder(
    User.find({ isDeleted: false, role: { $ne: USER_ROLE.admin } }).select(
      '_id id name email phoneNumber photoUrl headline following followers points avgRating skills languages expertise status isProfileSetup createdAt',
    ),
    query,
  )
    .search(['name'])
    .filter()
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
    role: USER_ROLE.consult,
    $or: matchConditions,
  }

  // 4️⃣ Query Builder (same standard you already use)
  const usersQuery = new QueryBuilder(
    User.find(baseFilter).select(
      '_id id firstName lastName photoUrl coverPhoto headline followers following avgRating skills languages expertise',
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
    role: USER_ROLE.consult,
    status: USER_STATUS.active,
    isDeleted: false,

    // 🎯 KEY LOGIC
    $or: [
      // Match key expertise (pink)
      {
        expertise: {
          $in: ['Property Investment & Development'],
        },
      },

      // Match sub-categories
      {
        skills: {
          $in: [
            'Real Estate',
            'Property Law',
            'Investment',
            'Real Estate Development',
          ],
        },
      },
    ],
  }

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id id firstName lastName photoUrl coverPhoto headline avgRating followers expertise skills hourlyRate',
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

  const result = await usersQuery.modelQuery
  const meta = await usersQuery.countTotal()

  return { meta, result }
}

const getTopExpertsFromDB = async (query: Record<string, unknown>) => {
  const filter = {
    role: USER_ROLE.consult,
    status: USER_STATUS.active,
    isDeleted: false,
    avgRating: { $gte: 4 },
  }

  const usersQuery = new QueryBuilder(
    User.find(filter).select(
      '_id id firstName lastName photoUrl coverPhoto headline avgRating ratingCount followers expertise skills',
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
const filterQuery: FilterQuery<any> = {
    isDeleted: false,
  }

  /* -------------------- 1️⃣ Price Range -------------------- */
  if (query.minPrice || query.maxPrice) {
    filterQuery.hourlyRate = {}

    if (query.minPrice) {
      filterQuery.hourlyRate.$gte = Number(query.minPrice)
    }

    if (query.maxPrice) {
      filterQuery.hourlyRate.$lte = Number(query.maxPrice)
    }
  }

  /* -------------------- 2️⃣ Learning Styles -------------------- */
  if (query.learningStyles) {
    filterQuery.learningStyles = {
      $in: (query.learningStyles as string).split(','),
    }
  }

  /* -------------------- 3️⃣ Interests -------------------- */
  if (query.interests) {
    filterQuery.interests = {
      $in: (query.interests as string).split(','),
    }
  }

  /* -------------------- 4️⃣ Availability (Nested Array) -------------------- */
  /**
   * ?availabilityDays=Monday,Tuesday
   */
  if (query.availabilityDays) {
    filterQuery.availability = {
      $elemMatch: {
        day: {
          $in: (query.availabilityDays as string).split(','),
        },
      },
    }
  }

  /* -------------------- 5️⃣ Rating -------------------- */
  /**
   * ?minRating=4
   */
  if (query.minRating) {
    filterQuery.avgRating = {
      $gte: Number(query.minRating),
    }
  }

  /* -------------------- 6️⃣ Session Duration -------------------- */
  /**
   * ?sessionDurationType=video,audio
   * ?sessionDurationMin=30
   */
  if (query.sessionDurationType || query.sessionDurationMin) {
    const sessionDurationMatch: any = {
      isOffered: true,
    }

    if (query.sessionDurationType) {
      sessionDurationMatch.type = {
        $in: (query.sessionDurationType as string).split(','),
      }
    }

    if (query.sessionDurationMin) {
      sessionDurationMatch.duration = { $gte: Number(query.sessionDurationMin) }
    }

    filterQuery.sessionDurations = {
      $elemMatch: sessionDurationMatch,
    }
  }

  /* -------------------- Query Builder -------------------- */
  const queryBuilder = new QueryBuilder(
    User.find(filterQuery),
    query,
  )
    .search(['firstName', 'lastName', 'expertise'])
    .sortByCustom({
      avgRating: -1,
      followers: -1,
      createdAt: -1,
    })
    .paginate()
    .fields()

  const result = await queryBuilder.modelQuery
  const meta = await queryBuilder.countTotal()

  return {
    meta,
    result,
  }
}

const geUserByIdFromDB = async (id: string) => {
  const user = await User.findById(id).select(
    '_id id name email phoneNumber photoUrl coverPhoto headline following followers points advisingTime avgRating skills languages expertise status createdAt',
  )
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  return user
}

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
    '_id id name email phoneNumber photoUrl headline following followers points avgRating skills languages expertise status createdAt',
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
    '_id id firstName lastName email photoUrl headline following followers points avgRating skills languages expertise status createdAt pushNotify emailNotify',
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

  //* checking if the user is blocked
  if (user?.status === 'blocked') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked ! !')
  }
  // console.log(payload)

  const updatedUser = await User.findByIdAndUpdate(userId, payload, {
    new: true,
  }).select(
    '_id id name email phoneNumber photoUrl headline following followers points avgRating skills languages expertise status createdAt',
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

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      location: { type: 'Point', coordinates: [longitude, latitude] },
      address: address,
    },
    { new: true },
  )

  return updatedUser
}

const deleteAUserFromDB = async (userId: string) => {
  //* Check if the user exists
  const user = await User.findById(userId).select('_id')
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  // Use `Promise.all` to execute updates in parallel
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { isDeleted: true },
    { new: true },
  ).select(
    '_id id name email phoneNumber photoUrl headline following followers points avgRating skills languages expertise status createdAt',
  )

  if (!updatedUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'Failed to update user status!')
  }

  return updatedUser
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
