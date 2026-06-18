import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { BookingSlots } from '../modules/bookingSlots/bookingSlots.model'
import { Booking } from '../modules/booking/booking.models'
import { User } from '../modules/user/user.model'
import { sendBookingsNotification, TBookingNotifyAction } from '../modules/booking/booking.utils'
import { createReminderEmailContent } from '../utils/emailNotify'
import emailSender from '../utils/emailSender'
import { TBookings } from '../modules/booking/booking.interface'

dayjs.extend(utc)
dayjs.extend(timezone)

const TIMEZONE = 'Asia/Dhaka'

export const timeSensitiveNotificationsJob = async (): Promise<void> => {
  const now = dayjs().tz(TIMEZONE)
  const nowDate = now.format('YYYY-MM-DD')

  const todaySlots = await BookingSlots.find({ date: nowDate }).distinct('_id')

  const todayBookings = (await Booking.find({
    slot: { $in: todaySlots },
    status: 'confirmed',
    isDeleted: false,
  })
    .populate('slot')
    .lean()) as any[]

  const userIds = [...new Set(todayBookings.map((b) => b.user.toString()))]
  const consultIds = [...new Set(todayBookings.map((b) => b.consult.toString()))]
  const allIds = [...new Set([...userIds, ...consultIds])]

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

  for (const booking of todayBookings) {
    const slot = booking.slot
    const user = userMap.get(booking.user.toString())
    const consult = userMap.get(booking.consult.toString())

    if (!user || !consult) continue

    const bookingStart = dayjs(`${slot.date} ${slot.time}`, 'YYYY-MM-DD HH:mm').tz(booking.timezone)
    const timeToStartMinutes = bookingStart.diff(now, 'minute')
    const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

    // 1. 10 minutes to go
    if (timeToStartMinutes >= 9 && timeToStartMinutes <= 10) {
      if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({ userId: user._id.toString(), fcmToken: user.fcmToken, action: '10min_reminder', booking, slot })
      }
      if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({ userId: consult._id.toString(), fcmToken: consult.fcmToken, action: '10min_reminder', booking, slot })
      }
      if (user.email && user.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(user.email, 'Session Starting in 10 Minutes',
            createReminderEmailContent(user.firstName, `${consult.firstName} ${consult.lastName}`, sessionInfo, false),
          ).catch((err) => console.error(`Email failed (user ${user._id}):`, err)),
        )
      }
      if (consult.email && consult.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(consult.email, 'Session Starting in 10 Minutes',
            createReminderEmailContent(consult.firstName, `${user.firstName} ${user.lastName}`, sessionInfo, false),
          ).catch((err) => console.error(`Email failed (consult ${consult._id}):`, err)),
        )
      }
    }

    // 2. Join the call (0–1 minute before)
    if (timeToStartMinutes >= 0 && timeToStartMinutes <= 1) {
      if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({ userId: user._id.toString(), fcmToken: user.fcmToken, action: 'join_call', booking, slot })
      }
      if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
        notificationsToSend.push({ userId: consult._id.toString(), fcmToken: consult.fcmToken, action: 'join_call', booking, slot })
      }
      if (user.email && user.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(user.email, 'Join Your Session Now',
            createReminderEmailContent(user.firstName, `${consult.firstName} ${consult.lastName}`, sessionInfo, true),
          ).catch((err) => console.error(`Email failed (user ${user._id}):`, err)),
        )
      }
      if (consult.email && consult.emailNotify?.schedule) {
        emailPromises.push(
          emailSender(consult.email, 'Join Your Session Now',
            createReminderEmailContent(consult.firstName, `${user.firstName} ${user.lastName}`, sessionInfo, true),
          ).catch((err) => console.error(`Email failed (consult ${consult._id}):`, err)),
        )
      }
    }
  }

  await Promise.allSettled(emailPromises)

  const chunkSize = 500
  for (let i = 0; i < notificationsToSend.length; i += chunkSize) {
    const chunk = notificationsToSend.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map((n) =>
        sendBookingsNotification(n.action as TBookingNotifyAction, n.booking, userMap.get(n.userId), n.slot),
      ),
    )
  }

  console.log(`Time-sensitive notifications processed for ${notificationsToSend.length} recipients`)
}