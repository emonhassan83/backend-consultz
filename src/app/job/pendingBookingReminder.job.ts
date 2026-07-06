import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'
import { sendBookingsNotification } from '../modules/booking/booking.utils'
import { TUser } from '../modules/user/user.interface'

dayjs.extend(utc)
dayjs.extend(timezone)

export const pendingBookingReminderJob = async (): Promise<void> => {
  console.log('Pending Booking Reminder Job Started')

  const nowUtc = dayjs.utc()
  const tenMinutesAgo = nowUtc.subtract(10, 'minute').toDate()

  // Find all pending bookings created at least 10 minutes ago
  const pendingBookings = await Booking.find({
    status: BOOKING_STATUS.pending,
    isDeleted: false,
    createdAt: { $lte: tenMinutesAgo },
  })
    .populate('slot')
    .populate('consult')
    .populate('user')

  console.log(`Found ${pendingBookings.length} pending bookings to check for reminders`)

  for (const booking of pendingBookings) {
    const slot = booking.slot as any
    const expert = booking.consult as any

    if (!slot || !expert) continue

    // Determine booking slot start time in UTC
    const bookingTimezone = booking.timezone || 'UTC'
    let bookingStartUtc: dayjs.Dayjs

    try {
      bookingStartUtc = dayjs
        .tz(`${slot.date} ${slot.time}`, 'YYYY-MM-DD HH:mm', bookingTimezone)
        .utc()
    } catch {
      bookingStartUtc = dayjs.utc(`${slot.date} ${slot.time}`, 'YYYY-MM-DD HH:mm')
    }

    // If the slot start time has already passed, the booking is expired/cannot be accepted anymore
    if (bookingStartUtc.isBefore(nowUtc)) {
      console.log(`Booking ${booking._id} slot has already passed/expired, skipping reminder.`)
      continue
    }

    // Send push notification if expert has it enabled
    if (expert.fcmToken && expert.pushNotify?.bookingAndSchedule) {
      try {
        await sendBookingsNotification(
          'pending_reminder',
          booking,
          expert as TUser,
          expert as TUser,
          slot,
        )
        console.log(`Pending reminder notification sent to expert ${expert._id} for booking ${booking._id}`)
      } catch (err) {
        console.error(`Failed to send pending reminder notification for booking ${booking._id}:`, err)
      }
    }
  }

  console.log('Pending Booking Reminder Job Completed')
}
