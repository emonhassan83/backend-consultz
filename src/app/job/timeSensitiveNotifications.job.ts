import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { BookingSlots } from '../modules/bookingSlots/bookingSlots.model'
import { Booking } from '../modules/booking/booking.models'
import { User } from '../modules/user/user.model'
import {
  sendBookingsNotification,
  TBookingNotifyAction,
} from '../modules/booking/booking.utils'
import { createReminderEmailContent } from '../utils/emailNotify'
import emailSender from '../utils/emailSender'
import { TBookings } from '../modules/booking/booking.interface'
import { TUser } from '../modules/user/user.interface'

dayjs.extend(utc)
dayjs.extend(timezone)

export const timeSensitiveNotificationsJob = async (): Promise<void> => {
  // Current time in UTC — each booking's timezone will be used for comparison
  const nowUtc = dayjs.utc()
  const todayUtcDate = nowUtc.format('YYYY-MM-DD')

  // Fetch today's slot IDs (based on UTC date — slots store UTC date strings)
  const todaySlots = await BookingSlots.find({ date: todayUtcDate }).distinct('_id')

  // Fetch all confirmed bookings for today's slots
  const todayBookings = (await Booking.find({
    slot: { $in: todaySlots },
    status: 'confirmed',
    isDeleted: false,
  })
    .populate('slot')
    .lean()) as any[]

  // Collect all unique user and consultant IDs for a single batch DB fetch
  const userIds = [...new Set(todayBookings.map((b) => b.user.toString()))]
  const consultIds = [...new Set(todayBookings.map((b) => b.consult.toString()))]
  const allIds = [...new Set([...userIds, ...consultIds])]

  // Batch fetch all users in one query to avoid N+1
  const usersRaw = await User.find({ _id: { $in: allIds } })
    .select('_id firstName lastName email fcmToken pushNotify emailNotify')
    .lean()

  const userMap = new Map(usersRaw.map((u) => [u._id.toString(), u]))

  const notificationsToSend: {
    userId: string
    fcmToken: string
    action: string
    booking: TBookings
    slot: any
  }[] = []

  const emailPromises: Promise<void>[] = []
  const tenMinReminderSentBookingIds: string[] = []
  const joinCallReminderSentBookingIds: string[] = []

  for (const booking of todayBookings) {
    const slot = booking.slot
    const user = userMap.get(booking.user.toString())
    const consult = userMap.get(booking.consult.toString())

    if (!user || !consult) continue

    // Use the booking's own timezone to determine the session start time
    const bookingTimezone = booking.timezone || 'UTC'

    let bookingStartUtc: dayjs.Dayjs

    try {
      // Parse slot date+time in booking's local timezone, then convert to UTC
      bookingStartUtc = dayjs
        .tz(`${slot.date} ${slot.time}`, 'YYYY-MM-DD HH:mm', bookingTimezone)
        .utc()
    } catch {
      // Fallback to UTC parsing if timezone is invalid
      bookingStartUtc = dayjs.utc(`${slot.date} ${slot.time}`, 'YYYY-MM-DD HH:mm')
    }

    // How many minutes until session starts (from now in UTC)
    const timeToStartMinutes = bookingStartUtc.diff(nowUtc, 'minute')

    const sessionInfo = `${booking.localDate} • ${booking.localTime} (${bookingTimezone})`

    // ── 10-minute reminder ────────────────────────────────────────────────────
    if (timeToStartMinutes <= 10 && timeToStartMinutes >= 2 && !booking.is10MinReminderSent) {
      tenMinReminderSentBookingIds.push(booking._id.toString())
      if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: user._id.toString(),
          fcmToken: user.fcmToken,
          action: '10min_reminder',
          booking,
          slot,
        })
      }
      if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: consult._id.toString(),
          fcmToken: consult.fcmToken,
          action: '10min_reminder',
          booking,
          slot,
        })
      }
      if (user.email && user.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(
            user.email,
            'Session Starting in 10 Minutes',
            createReminderEmailContent(
              user.firstName,
              `${consult.firstName} ${consult.lastName}`,
              sessionInfo,
              false,
            ),
          ).catch((err) => console.error(`10min email failed (user ${user._id}):`, err)),
        )
      }
      if (consult.email && consult.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(
            consult.email,
            'Session Starting in 10 Minutes',
            createReminderEmailContent(
              consult.firstName,
              `${user.firstName} ${user.lastName}`,
              sessionInfo,
              false,
            ),
          ).catch((err) => console.error(`10min email failed (consult ${consult._id}):`, err)),
        )
      }
    }

    // ── Join call reminder (0–1 min before start or up to 3 min after) ──────
    if (timeToStartMinutes <= 1 && timeToStartMinutes >= -3 && !booking.isJoinCallReminderSent) {
      joinCallReminderSentBookingIds.push(booking._id.toString())
      if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: user._id.toString(),
          fcmToken: user.fcmToken,
          action: 'join_call',
          booking,
          slot,
        })
      }
      if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: consult._id.toString(),
          fcmToken: consult.fcmToken,
          action: 'join_call',
          booking,
          slot,
        })
      }
      if (user.email && user.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(
            user.email,
            'Join Your Session Now',
            createReminderEmailContent(
              user.firstName,
              `${consult.firstName} ${consult.lastName}`,
              sessionInfo,
              true,
            ),
          ).catch((err) => console.error(`Join email failed (user ${user._id}):`, err)),
        )
      }
      if (consult.email && consult.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(
            consult.email,
            'Join Your Session Now',
            createReminderEmailContent(
              consult.firstName,
              `${user.firstName} ${user.lastName}`,
              sessionInfo,
              true,
            ),
          ).catch((err) => console.error(`Join email failed (consult ${consult._id}):`, err)),
        )
      }
    }
  }

  // Send all emails in parallel — individual failures do not affect others
  await Promise.allSettled(emailPromises)

  // Send push notifications in batches of 500 to avoid memory pressure
  const chunkSize = 500
  for (let i = 0; i < notificationsToSend.length; i += chunkSize) {
    const chunk = notificationsToSend.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map((n) =>
        sendBookingsNotification(
          n.action as TBookingNotifyAction,
          n.booking,
          userMap.get(n.userId) as TUser,
          userMap.get(n.booking.consult.toString()) as TUser,
          n.slot,
        ),
      ),
    )
  }

  if (tenMinReminderSentBookingIds.length > 0) {
    await Booking.updateMany(
      { _id: { $in: tenMinReminderSentBookingIds } },
      { is10MinReminderSent: true }
    )
  }

  if (joinCallReminderSentBookingIds.length > 0) {
    await Booking.updateMany(
      { _id: { $in: joinCallReminderSentBookingIds } },
      { isJoinCallReminderSent: true }
    )
  }

  console.log(
    `Time-sensitive notifications processed for ${notificationsToSend.length} recipients`,
  )
}