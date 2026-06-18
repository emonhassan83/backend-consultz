import dayjs from 'dayjs'
import { Booking } from '../modules/booking/booking.models'
import { Reviews } from '../modules/review/review.models'
import { notifyUserToLeaveReview } from '../modules/review/review.utils'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'

export const dailyReviewReminderJob = async (): Promise<void> => {
  console.log('Daily Review Reminder Job Started')

  const twentyFourHoursAgo = dayjs().subtract(24, 'hour').toDate()
  const fortyEightHoursAgo = dayjs().subtract(48, 'hour').toDate()

  const completedBookings = await Booking.find({
    status: BOOKING_STATUS.completed,
    endTime: { $gte: fortyEightHoursAgo, $lte: twentyFourHoursAgo },
    isDeleted: false,
  })
    .select('user consult')
    .lean()

  console.log(`Found ${completedBookings.length} eligible bookings for review reminder`)

  for (const booking of completedBookings) {
    const userId = booking.user.toString()
    const bookingId = booking._id.toString()

    const existingReview = await Reviews.findOne({
      user: userId,
      booking: bookingId,
      isDeleted: false,
    })
      .select('_id')
      .lean()

    if (!existingReview) {
      await notifyUserToLeaveReview(bookingId, userId, booking.consult.toString())
      console.log(`Review reminder sent for booking ${bookingId} to user ${userId}`)
    } else {
      console.log(`Review already exists for booking ${bookingId} — skipping`)
    }
  }

  console.log('Daily Review Reminder Job Completed')
}