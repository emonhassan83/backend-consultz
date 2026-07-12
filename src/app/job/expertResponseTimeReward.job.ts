import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { User } from '../modules/user/user.model'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { sendNotification } from '../utils/sentNotification'
import { modeType } from '../modules/notification/notification.interface'

dayjs.extend(utc)
dayjs.extend(timezone)

export const expertResponseTimeRewardJob = async (): Promise<void> => {
  console.log('[Response Time Reward] Job started')

  const sevenDaysAgo = dayjs.utc().subtract(7, 'day').toDate()

  const experts = await User.find({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
  }).select('_id fcmToken pushNotify')

  for (const expert of experts) {
    // Fetch all booking requests assigned to this expert in the last 7 days
    const bookingRequests = await Booking.find({
      consult: expert._id,
      createdAt: { $gte: sevenDaysAgo },
      paymentStatus: PAYMENT_STATUS.paid,
      isDeleted: false,
      // Check all non-pending statuses — these were responded to
      status: { $ne: BOOKING_STATUS.pending },
    }).select('_id createdAt respondedAt timezone')

    const totalRequests = bookingRequests.length
    if (totalRequests === 0) continue

    let fastResponses = 0

    for (const req of bookingRequests) {
      if (!req.respondedAt) continue

      // Calculate response time using the booking's own timezone for accuracy
      const bookingTz = (req as any).timezone || 'UTC'

      const createdAtLocal = dayjs.utc(req.createdAt).tz(bookingTz)
      const respondedAtLocal = dayjs.utc(req.respondedAt).tz(bookingTz)

      const responseTimeMinutes = respondedAtLocal.diff(createdAtLocal, 'minute')

      console.log(
        `Booking ${req._id} | tz: ${bookingTz} | response time: ${responseTimeMinutes} min`,
      )

      if (responseTimeMinutes <= 30) fastResponses++
    }

    // Award 50 points if 80% or more requests were responded to within 30 minutes
    const fastResponseRate = (fastResponses / totalRequests) * 100

    if (fastResponseRate < 80) {
      console.log(
        `[Response Time Reward] ❌ Expert ${expert._id} — rate: ${fastResponseRate.toFixed(1)}% — skipping`,
      )
      continue
    }

    await User.findByIdAndUpdate(expert._id, { $inc: { points: 50 } })

    console.log(
      `[Response Time Reward] ✅ 50 points awarded to expert ${expert._id} (rate: ${fastResponseRate.toFixed(1)}%)`,
    )

    if (expert.fcmToken && expert.pushNotify?.points) {
      await sendNotification([expert.fcmToken], {
        receiver: expert._id,
        message: 'Fast Response Reward!',
        description:
          'You earned 50 points this week for maintaining fast response time to booking requests. Excellent! 🎉',
        reference: expert._id,
        modelType: modeType.Achievement,
      }).catch((err) =>
        console.error(`Push failed for expert ${expert._id}:`, err),
      )
    }
  }

  console.log('[Response Time Reward] Job completed')
}
