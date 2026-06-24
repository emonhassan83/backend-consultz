import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { Booking } from '../modules/booking/booking.models'
import { Reviews } from '../modules/review/review.models'
import { notifyUserToLeaveReview } from '../modules/review/review.utils'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'

dayjs.extend(utc)
dayjs.extend(timezone)

export const dailyReviewReminderJob = async (): Promise<void> => {
  console.log('Daily Review Reminder Job Started')

  // Target bookings completed between 24–48 hours ago (in UTC)
  const twentyFourHoursAgo = dayjs.utc().subtract(24, 'hour').toDate()
  const fortyEightHoursAgo = dayjs.utc().subtract(48, 'hour').toDate()

  // Find completed bookings within the reminder window
  const completedBookings = await Booking.find({
    status: BOOKING_STATUS.completed,
    updatedAt: { $gte: fortyEightHoursAgo, $lte: twentyFourHoursAgo },
    isDeleted: false,
  })
    .select('user consult timezone localDate localTime')
    .lean()

  console.log(`Found ${completedBookings.length} eligible bookings for review reminder`)

  for (const booking of completedBookings) {
    const userId = booking.user.toString()
    const bookingId = booking._id.toString()
    const bookingTimezone = (booking as any).timezone || 'UTC'

    // Use the booking's own timezone to log the completion time for clarity
    const completedAtLocal = dayjs.utc((booking as any).updatedAt)
      .tz(bookingTimezone)
      .format('YYYY-MM-DD HH:mm z')

    console.log(
      `Checking booking ${bookingId} | tz: ${bookingTimezone} | completed at: ${completedAtLocal}`,
    )

    // Skip if user already left a review for this booking
    const existingReview = await Reviews.findOne({
      user: userId,
      booking: bookingId,
      isDeleted: false,
    })
      .select('_id')
      .lean()

    if (existingReview) {
      console.log(`Review already exists for booking ${bookingId} — skipping`)
      continue
    }

    // Send review reminder push + in-app notification
    await notifyUserToLeaveReview(
      bookingId,
      userId,
      booking.consult.toString(),
    ).catch((err) =>
      console.error(`Review reminder failed for booking ${bookingId}:`, err),
    )

    console.log(`Review reminder sent for booking ${bookingId} to user ${userId}`)
  }

  console.log('Daily Review Reminder Job Completed')
}