import { Types } from 'mongoose'
import { Reviews } from './review.models'

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
