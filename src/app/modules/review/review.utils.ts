import { Types } from 'mongoose'
import { Reviews } from './review.models'
import { User } from '../user/user.model';
import { modeType } from '../notification/notification.interface';
import { sendNotification } from '../../utils/sentNotification';

// New review to notify expert
export const notifyExpertOnNewReview = async (
  reviewId: string,
  reviewerId: string,
  expertId: string,
  rating: number,
) => {
  try {
    const [reviewer, expert] = await Promise.all([
      User.findById(reviewerId).select('firstName'),
      User.findById(expertId).select('fcmToken pushNotify'),
    ]);

    if (!expert || !reviewer || !expert.fcmToken || expert.pushNotify?.reviews === false) {
      return;
    }

    const message = 'New review!';
    const description = `${reviewer.firstName} left you a ${rating}-star review`;

    const notifyPayload = {
      receiver: expert._id,
      message,
      description,
      reference: reviewId,
      modelType: modeType.Reviews,
    };

    await sendNotification([expert.fcmToken], notifyPayload);

    console.log(`New review notification sent to expert ${expertId}`);
  } catch (error) {
    console.error('Failed to notify expert on new review:', error);
  }
};

// Booking complete then notify to user
export const notifyUserToLeaveReview = async (
  bookingId: string,
  userId: string,
  expertId: string,
) => {
  try {
    const [user, expert] = await Promise.all([
      User.findById(userId).select('fcmToken pushNotify'),
      User.findById(expertId).select('firstName'),
    ]);

    if (!user || !expert || !user.fcmToken) return;

    // If user review notification enable
    if (user.pushNotify?.reviews === false) return;

    const message = `Leave a review for ${expert.firstName}`;
    const description = 'How was your experience?';

    const notifyPayload = {
      receiver: user._id,
      message,
      description,
      reference: bookingId,
      modelType: modeType.Booking,
    };

    await sendNotification([user.fcmToken], notifyPayload);

    console.log(`Review reminder sent to user ${userId} for booking ${bookingId}`);
  } catch (error) {
    console.error('Failed to send review reminder:', error);
  }
};

interface IReturn {
  averageRating: number
  totalReviews: number
}

export const getAverageRating = async (
  referenceId: string,
): Promise<IReturn> => {
  const result = await Reviews.aggregate([
    {
      $match: { reference: new Types.ObjectId(referenceId) }, // Filter by reference ID
    },
    {
      $group: {
        _id: '$reference',
        averageRating: { $avg: '$rating' }, // Calculate average rating
        totalReviews: { $sum: 1 }, // Count total reviews
      },
    },
  ])

  if (result.length === 0) {
    return { averageRating: 0, totalReviews: 0 }
  }

  return {
    averageRating: parseFloat(result[0].averageRating.toFixed(2)),
    totalReviews: result[0].totalReviews,
  }
}
