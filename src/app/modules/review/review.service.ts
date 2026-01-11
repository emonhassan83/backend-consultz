import httpStatus from 'http-status'
import { TReviews } from './review.interface'
import QueryBuilder from '../../builder/QueryBuilder'
import { getAverageRating } from './review.utils'
import { ClientSession, startSession } from 'mongoose'
import { Reviews } from './review.models'
import AppError from '../../errors/AppError'
import { User } from '../user/user.model'

const createReviews = async (payload: TReviews, userId: string) => {
  const { booking: bookingId } = payload

  const refUser = await User.findById(userId)
  if (!refUser || refUser?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, `User not found!`)
  }

  const session: ClientSession = await startSession()
  session.startTransaction()

  try {
    // Create the review
    const result: TReviews[] = await Reviews.create([payload], { session })
    if (!result || result.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create review')
    }

    // Calculate the new average rating
    const { averageRating, totalReviews } = await getAverageRating(
      result[0]?.booking?.toString(),
    )

    const newAvgRating =
      (Number(averageRating) * Number(totalReviews) + Number(payload.rating)) /
      (totalReviews + 1)

    await User.findByIdAndUpdate(
      result[0].booking,
      {
        avgRating: newAvgRating.toFixed(2),
        $addToSet: { reviews: result[0]?._id },
      },
      { session },
    )

    await session.commitTransaction()
    session.endSession()

    return result[0]
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
    Reviews.find().populate([{ path: 'user', select: 'name email photoUrl' }]),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()
    .fields()

  const data = await reviewsModel.modelQuery
  const meta = await reviewsModel.countTotal()

  return {
    data,
    meta,
  }
}

const getReviewsById = async (id: string) => {
  const result = await Reviews.findById(id).populate([
    { path: 'booking' },
    { path: 'user', select: 'name email photoUrl' },
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
