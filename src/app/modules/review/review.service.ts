import httpStatus from 'http-status'
import { TReviews } from './review.interface'
import QueryBuilder from '../../builder/QueryBuilder'
import { ClientSession, startSession } from 'mongoose'
import { Reviews } from './review.models'
import AppError from '../../errors/AppError'
import { User } from '../user/user.model'
import { Booking } from '../booking/booking.models'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'

const createReviews = async (
  payload: Omit<TReviews, 'user' | 'expert'>,
  userId: string,
) => {
  const session: ClientSession = await startSession();
  session.startTransaction();

  try {
    // 1. Validate reviewer (user who is leaving the review)
    const reviewer = await User.findOne(
      { _id: userId, isDeleted: false },
      { _id: 1, points: 1, pushNotify: 1, fcmToken: 1 }
    )
      .session(session)
      .lean();

    if (!reviewer) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found or deleted!');
    }

    // 2. Validate booking & get expert (who is receiving the review)
    const booking = await Booking.findOne(
      { _id: payload.booking, isDeleted: false },
      { consult: 1 }
    )
      .session(session)
      .lean();

    if (!booking || !booking.consult) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or invalid!');
    }

    // 3. Prepare final review payload
    const finalPayload = {
      ...payload,
      user: reviewer._id,
      expert: booking.consult,
    };

    // 4. Create the review
    const [newReview] = await Reviews.create([finalPayload], { session });
    if (!newReview) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create review');
    }

    // 5. Calculate new average rating for the expert
    const ratingStats = await Reviews.aggregate([
      { $match: { expert: booking.consult } },
      {
        $group: {
          _id: null,
          totalRating: { $sum: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]).session(session);

    const { totalRating = 0, count = 0 } = ratingStats[0] || {};
    const newAvgRating = count > 0 ? totalRating / count : 0;

    // 6. Update expert's avgRating & ratingCount
    const expert = await User.findById(booking.consult).session(session);
    if (expert) {
      expert.avgRating = Number(newAvgRating.toFixed(2));
      expert.ratingCount = (expert.ratingCount || 0) + 1;

      // Reward #1: Expert gets 200 points for each 5-star review
      if (payload.rating === 5) {
        expert.points = (expert.points || 0) + 200;

        // Send push notification to expert (if enabled)
        if (expert.fcmToken && expert.pushNotify?.points) {
          await sendNotification([expert.fcmToken], {
            receiver: expert._id,
            message: '5-Star Review Received!',
            description: 'Congratulations! You earned 200 points for receiving a 5-star review. Keep up the great work! 🎉',
            reference: newReview._id,
            modelType: modeType.Reviews
          });
        }
      }

      // Reward #2: Expert gets 500 points if average rating is 4.7+ over last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get all reviews in last 30 days for this expert
      const recentReviews = await Reviews.find(
        {
          expert: expert._id,
          createdAt: { $gte: thirtyDaysAgo },
        },
        { rating: 1 }
      ).session(session).lean();

      const recentCount = recentReviews.length;
      const recentTotal = recentReviews.reduce((sum, r) => sum + r.rating, 0);
      const recentAvg = recentCount > 0 ? recentTotal / recentCount : 0;

      if (recentAvg >= 4.7 && recentCount >= 1) { // at least 1 review in 30 days
        expert.points = (expert.points || 0) + 500;

        // Send bonus notification
        if (expert.fcmToken && expert.pushNotify?.points) {
          await sendNotification([expert.fcmToken], {
            receiver: expert._id,
            message: 'High Rating Streak Bonus!',
            description: 'You maintained 4.7+ average rating over the last 30 days and earned 500 bonus points! Excellent work! 🎉',
            reference: newReview._id,
            modelType: modeType.Reviews
          });
        }
      }

      // Save expert updates (points, avgRating, ratingCount)
      await expert.save({ session });
    }

    // 7. Award points to reviewer (user who left the review) - existing logic
    const pointsToAdd = 100; // Base for verified review
    let additionalPoints = 0;

    // Bonus 50 points if rating is 4 or above
    if (payload.rating >= 4) {
      additionalPoints = 50;
    }

    const totalPointsAwarded = pointsToAdd + additionalPoints;

    const updatedReviewer = await User.findByIdAndUpdate(
      reviewer._id,
      { $inc: { points: totalPointsAwarded } },
      { new: true, session }
    );

    // 8. Send push notification to reviewer (if enabled)
    if (updatedReviewer?.fcmToken && updatedReviewer.pushNotify?.points) {
      await sendNotification([updatedReviewer.fcmToken], {
        receiver: updatedReviewer._id,
        message: 'Review Submitted Successfully!',
        description: `You earned ${totalPointsAwarded} points for leaving a verified review. Thank you! 🎉`,
        reference: newReview._id,
        modelType: modeType.Reviews
      });
    }

    // 9. Commit transaction
    await session.commitTransaction();
    session.endSession();

    return newReview;
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error?.message || 'Review creation failed',
    );
  }
};

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
