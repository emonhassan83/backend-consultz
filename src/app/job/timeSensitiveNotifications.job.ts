import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
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
dayjs.extend(customParseFormat)

const TEN_MIN_REMINDER_TRIGGER_MINUTES = 8
const JOIN_CALL_TRIGGER_MINUTES = -1
const JOIN_CALL_GRACE_MINUTES = -5

export const timeSensitiveNotificationsJob = async (bookingId?: string): Promise<void> => {
  // Current time in UTC — each booking's timezone will be used for comparison
  const nowUtc = dayjs.utc()

  // Avoid a UTC-date slot pre-filter: slot date/time must be interpreted using
  // each booking's timezone, especially around midnight and date boundaries.
  const todayBookings = (await Booking.find({
    ...(bookingId ? { _id: bookingId } : {}),
    status: BOOKING_STATUS.confirmed,
    paymentStatus: PAYMENT_STATUS.paid,
    isDeleted: false,
    $or: [
      { is10MinReminderSent: { $ne: true } },
      { isJoinCallReminderSent: { $ne: true } },
    ],
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
    reminderType: 'ten_min' | 'join_call'
  }[] = []

  const emailPromises: Promise<void>[] = []
  const tenMinReminderSentBookingIds: string[] = []
  const joinCallReminderSentBookingIds: string[] = []
  const failedTenMinBookingIds = new Set<string>()
  const failedJoinCallBookingIds = new Set<string>()

  for (const booking of todayBookings) {
    const slot = booking.slot
    const user = userMap.get(booking.user.toString())
    const consult = userMap.get(booking.consult.toString())

    if (!user || !consult) continue

    // Use the booking's own timezone to determine the session start time
    const bookingTimezone = booking.timezone || 'UTC'
    const hasValidLocalDateTime = Boolean(
      booking.localDate &&
      booking.localTime &&
      dayjs(`${booking.localDate} ${booking.localTime}`, 'YYYY-MM-DD HH:mm', true).isValid(),
    )
    const bookingDate = hasValidLocalDateTime ? booking.localDate : slot.date
    const bookingTime = hasValidLocalDateTime ? booking.localTime : slot.time

    let bookingStartUtc: dayjs.Dayjs

    try {
      // Parse slot date+time in booking's local timezone, then convert to UTC
      bookingStartUtc = dayjs
        .tz(`${bookingDate} ${bookingTime}`, 'YYYY-MM-DD HH:mm', bookingTimezone)
        .utc()
    } catch {
      // Fallback to UTC parsing if timezone is invalid
      bookingStartUtc = dayjs.utc(`${bookingDate} ${bookingTime}`, 'YYYY-MM-DD HH:mm')
    }

    // How many minutes until session starts (from now in UTC)
    const timeToStartMinutes = bookingStartUtc.diff(nowUtc, 'minute')

    const sessionInfo = `${booking.localDate} • ${booking.localTime} (${bookingTimezone})`

    // ── 10-minute reminder ────────────────────────────────────────────────────
    if (
      timeToStartMinutes <= TEN_MIN_REMINDER_TRIGGER_MINUTES &&
      timeToStartMinutes >= 0 &&
      !booking.is10MinReminderSent
    ) {
      const claimResult = await Booking.updateOne(
        { _id: booking._id, is10MinReminderSent: { $ne: true } },
        { $set: { is10MinReminderSent: true } },
      )

      if (claimResult.modifiedCount < 1) continue

      tenMinReminderSentBookingIds.push(booking._id.toString())
      if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: user._id.toString(),
          fcmToken: user.fcmToken,
          action: '10min_reminder',
          booking,
          slot,
          reminderType: 'ten_min',
        })
      }
      if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: consult._id.toString(),
          fcmToken: consult.fcmToken,
          action: '10min_reminder',
          booking,
          slot,
          reminderType: 'ten_min',
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
          ).catch((err) => {
            failedTenMinBookingIds.add(booking._id.toString())
            console.error(`10min email failed (user ${user._id}):`, err)
            throw err
          }),
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
          ).catch((err) => {
            failedTenMinBookingIds.add(booking._id.toString())
            console.error(`10min email failed (consult ${consult._id}):`, err)
            throw err
          }),
        )
      }
    }

    // ── Join call reminder (0–1 min before start or up to 3 min after) ──────
    if (
      timeToStartMinutes <= JOIN_CALL_TRIGGER_MINUTES &&
      timeToStartMinutes >= JOIN_CALL_GRACE_MINUTES &&
      !booking.isJoinCallReminderSent
    ) {
      const claimResult = await Booking.updateOne(
        { _id: booking._id, isJoinCallReminderSent: { $ne: true } },
        { $set: { isJoinCallReminderSent: true } },
      )

      if (claimResult.modifiedCount < 1) continue

      joinCallReminderSentBookingIds.push(booking._id.toString())
      if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: user._id.toString(),
          fcmToken: user.fcmToken,
          action: 'join_call',
          booking,
          slot,
          reminderType: 'join_call',
        })
      }
      if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({
          userId: consult._id.toString(),
          fcmToken: consult.fcmToken,
          action: 'join_call',
          booking,
          slot,
          reminderType: 'join_call',
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
          ).catch((err) => {
            failedJoinCallBookingIds.add(booking._id.toString())
            console.error(`Join email failed (user ${user._id}):`, err)
            throw err
          }),
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
          ).catch((err) => {
            failedJoinCallBookingIds.add(booking._id.toString())
            console.error(`Join email failed (consult ${consult._id}):`, err)
            throw err
          }),
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
          {
            otherPartyName:
              n.userId === n.booking.user.toString()
                ? userMap.get(n.booking.consult.toString())?.firstName || 'your expert'
                : userMap.get(n.booking.user.toString())?.firstName || 'your client',
          },
        ).catch((error) => {
          const failedSet = n.reminderType === 'ten_min'
            ? failedTenMinBookingIds
            : failedJoinCallBookingIds
          failedSet.add(n.booking._id!.toString())
          throw error
        }),
      ),
    )
  }

  const successfulTenMinIds = tenMinReminderSentBookingIds.filter(
    (id) => !failedTenMinBookingIds.has(id),
  )
  const successfulJoinCallIds = joinCallReminderSentBookingIds.filter(
    (id) => !failedJoinCallBookingIds.has(id),
  )

  if (successfulTenMinIds.length > 0) {
    await Booking.updateMany(
      { _id: { $in: successfulTenMinIds } },
      { $set: { is10MinReminderSent: true } }
    )
  }

  if (successfulJoinCallIds.length > 0) {
    await Booking.updateMany(
      { _id: { $in: successfulJoinCallIds } },
      { $set: { isJoinCallReminderSent: true } }
    )
  }

  if (failedTenMinBookingIds.size > 0) {
    await Booking.updateMany(
      { _id: { $in: [...failedTenMinBookingIds] } },
      { $set: { is10MinReminderSent: false } },
    )
  }

  if (failedJoinCallBookingIds.size > 0) {
    await Booking.updateMany(
      { _id: { $in: [...failedJoinCallBookingIds] } },
      { $set: { isJoinCallReminderSent: false } },
    )
  }

  console.log(
    `Time-sensitive notifications processed for ${notificationsToSend.length} recipients`,
  )
}
