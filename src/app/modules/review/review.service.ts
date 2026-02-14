import cron from 'node-cron'
import dayjs from 'dayjs'
import httpStatus from 'http-status'
import { TReviews } from './review.interface'
import QueryBuilder from '../../builder/QueryBuilder'
import { ClientSession, startSession } from 'mongoose'
import { Reviews } from './review.models'
import AppError from '../../errors/AppError'
import { User } from '../user/user.model'
import { Booking } from '../booking/booking.models'
import { notifyUserToLeaveReview } from './review.utils'
import { BOOKING_STATUS } from '../booking/booking.constants'

export const notifyUserToLeaveReviewCorn = () => {
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('Daily Review Reminder Job Started (Asia/Dhaka)')

      // find completed booking
      const twentyFourHoursAgo = dayjs().subtract(24, 'hour').toDate()
      const fortyEightHoursAgo = dayjs().subtract(48, 'hour').toDate()

      const completedBookings = await Booking.find({
        status: BOOKING_STATUS.completed,
        endTime: { $gte: fortyEightHoursAgo, $lte: twentyFourHoursAgo },
        isDeleted: false,
      })
        .select('user consult')
        .lean()

      console.log(
        `Found ${completedBookings.length} eligible bookings for review reminder`,
      )

      for (const booking of completedBookings) {
        const userId = booking.user.toString()
        const bookingId = booking._id.toString()

        // check if this user can review or not
        const existingReview = await Reviews.findOne({
          user: userId,
          booking: bookingId,
          isDeleted: false,
        })
          .select('_id')
          .lean()

        // For review remainder
        if (!existingReview) {
          await notifyUserToLeaveReview(
            bookingId,
            userId,
            booking.consult.toString(),
          )
          console.log(
            `Review reminder sent for booking ${bookingId} to user ${userId}`,
          )
        } else {
          console.log(
            `Review already exists for booking ${bookingId} by user ${userId} — skipping`,
          )
        }
      }

      console.log('Daily Review Reminder Job Completed')
    },
    {
      timezone: 'Europe/London', // UK time (BST/GMT)
    },
  )
}

const createReviews = async (
  payload: Omit<TReviews, 'user' | 'expert'>,
  userId: string,
) => {
  const session: ClientSession = await startSession()
  session.startTransaction()

  try {
    // 1. Validate user (single lean query - faster)
    const user = await User.findOne(
      { _id: userId, isDeleted: false },
      { _id: 1 },
    )
      .session(session)
      .lean()

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found or deleted!')
    }

    // 2. Validate booking & get expert (populate expert in one query)
    const booking = await Booking.findOne(
      { _id: payload.booking, isDeleted: false },
      { consult: 1 },
    )
      .session(session)
      .lean()

    if (!booking || !booking.consult) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or invalid!')
    }

    // 3. Prepare final payload
    const finalPayload = {
      ...payload,
      user: user._id,
      expert: booking.consult,
    }

    // 4. Create review in transaction
    const [newReview] = await Reviews.create([finalPayload], { session })

    if (!newReview) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create review')
    }

    // 5. Calculate new average rating (optimized aggregation)
    const ratingStats = await Reviews.aggregate([
      { $match: { expert: booking.consult } },
      {
        $group: {
          _id: null,
          totalRating: { $sum: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]).session(session)

    const { totalRating = 0, count = 0 } = ratingStats[0] || {}
    const newAvgRating = count > 0 ? totalRating / count : 0

    // 6. Update expert's avgRating & push review ID (atomic update)
    await User.findByIdAndUpdate(
      booking.consult,
      {
        $set: {
          avgRating: Number(newAvgRating.toFixed(2)),
        },
        $inc: {
          ratingCount: 1,
        },
      },
      { session, new: true },
    )

    // 7. Commit transaction
    await session.commitTransaction()
    session.endSession()

    return newReview
  } catch (error: any) {
    await session.abortTransaction()
    session.endSession()
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error?.message || 'Review creation failed',
    )
  }
}

const getAllReviews = async (query: Record<string, any>) => {
  const reviewsModel = new QueryBuilder(
    Reviews.find()
      .populate([
        { path: 'user', select: 'firstName lastName photoUrl' },
        {
          path: 'booking',
          select: 'sessionType',
        },
      ])
      .select('user booking review rating createdAt'),
    query,
  )
    .search([''])
    .filter()
    .sortReviews() // custom sort (latest, highest, lowest)
    .paginate()
    .fields()

  const data = await reviewsModel.modelQuery
  const meta = await reviewsModel.countTotal()

  const ratingBreakdown = await Reviews.aggregate([
    {
      $match: reviewsModel.modelQuery.getFilter(),
    },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 },
      },
    },
  ])

  // 5 category with map
  const countMap = {
    excellent: 0, // 5
    veryGood: 0, // 4
    good: 0, // 3
    fair: 0, // 2
    poor: 0, // 1
  }

  ratingBreakdown.forEach((item) => {
    const rating = item._id
    if (rating === 5) countMap.excellent = item.count
    else if (rating === 4) countMap.veryGood = item.count
    else if (rating === 3) countMap.good = item.count
    else if (rating === 2) countMap.fair = item.count
    else if (rating === 1) countMap.poor = item.count
  })

  return {
    meta,
    data: {
      ratingBreakdown: countMap,
      reviews: data,
    },
  }
}

const getReviewsById = async (id: string) => {
  const result = await Reviews.findById(id).populate([
    { path: 'user', select: 'firstName lastName photoUrl' },
    { path: 'booking', select: 'sessionType' },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Reviews not found!')
  }

  return result
}

const updateReviews = async (id: string, payload: Partial<TReviews>) => {
  const result = await Reviews.findByIdAndUpdate(id, payload, { new: true })
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update Reviews')
  }
  return result
}

const deleteReviews = async (id: string) => {
  const result = await Reviews.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete Reviews')
  }

  return result
}

export const reviewsService = {
  createReviews,
  getAllReviews,
  getReviewsById,
  updateReviews,
  deleteReviews,
}
