import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { sendBookingsNotification } from '../modules/booking/booking.utils'
import { TUser } from '../modules/user/user.interface'
import { resolveBookingStartUtc } from './bookingJobTime.utils'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const pendingBookingReminderJob = async (): Promise<void> => {
  console.log('Pending Booking Reminder Job Started')

  const nowUtc = dayjs.utc()
  const tenMinutesAgo = nowUtc.subtract(10, 'minute').toDate()

  // Find all pending bookings created at least 10 minutes ago
  const pendingBookings = await Booking.find({
    status: BOOKING_STATUS.pending,
    paymentStatus: PAYMENT_STATUS.paid,
    isDeleted: false,
    createdAt: { $lte: tenMinutesAgo },
    $or: [
      { lastPendingReminderSentAt: { $exists: false } },
      { lastPendingReminderSentAt: null },
      { lastPendingReminderSentAt: { $lte: tenMinutesAgo } },
    ],
  })
    .populate('consult')
    .populate('user')

  console.log(`Found ${pendingBookings.length} pending bookings to check for reminders`)

  for (const booking of pendingBookings) {
    const expert = booking.consult as any
    const booker = booking.user as any

    if (!expert) {
      console.warn(`Booking ${booking._id} is missing its expert; reminder skipped.`)
      continue
    }

    const bookingStartUtc = resolveBookingStartUtc(booking)
    if (!bookingStartUtc) {
      console.warn(`Booking ${booking._id} has no start time; reminder skipped.`)
      continue
    }

    // If the booking start time has already passed, the booking is expired/cannot be accepted anymore
    if (bookingStartUtc.isBefore(nowUtc)) {
      console.log(`Booking ${booking._id} start time has already passed/expired, skipping reminder.`)
      continue
    }

    // Send push notification if expert has it enabled
    if (expert.fcmToken && expert.pushNotify?.bookingAndSchedule) {
      try {
        const deliveryResult = await sendBookingsNotification(
          'pending_reminder',
          booking,
          expert as TUser,
          expert as TUser,
          { requesterName: booker?.firstName || 'your client' },
        )

        if (!deliveryResult || deliveryResult.successCount < 1) {
          throw new Error('Firebase did not deliver the reminder to the expert token')
        }

        await Booking.updateOne(
          { _id: booking._id, status: BOOKING_STATUS.pending },
          { lastPendingReminderSentAt: new Date() },
        )
        console.log(`Pending reminder notification sent to expert ${expert._id} for booking ${booking._id}`)
      } catch (err) {
        console.error(`Failed to send pending reminder notification for booking ${booking._id}:`, err)
      }
    } else {
      console.log(
        `Pending reminder skipped for booking ${booking._id}: expert has no FCM token or booking notifications are disabled.`,
      )
    }
  }

  console.log('Pending Booking Reminder Job Completed')
}
