import cron from 'node-cron'
import dayjs from 'dayjs'
import { BookingSlots } from '../modules/bookingSlots/bookingSlots.model'
import { Booking } from '../modules/booking/booking.models'
import { User } from '../modules/user/user.model'
import {
  sendBookingsNotification,
  TBookingNotifyAction,
} from '../modules/booking/booking.utils'
import mongoose from 'mongoose'
import { Contents } from '../modules/contents/contents.models'
import { Withdraw } from '../modules/withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../modules/withdraw/withdraw.constant'
import StripeService from '../class/stripe/stripe'
import { sendWithdrawNotify } from '../modules/withdraw/withdraw.utils'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'
import { Reviews } from '../modules/review/review.models'
import { notifyUserToLeaveReview } from '../modules/review/review.utils'
import emailSender from './emailSender'
import { createReminderEmailContent } from './emailNotify'

/**
 * Initializes and starts all scheduled cron jobs.
 * This function should be called once during server startup.
 */
export const initializeCronJobs = () => {
  // 1. Daily withdraw transfer job (12:00 AM UK time)
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('Daily Withdraw Transfer Job Started at 12:00 AM UK time')

      const session = await mongoose.startSession()
      session.startTransaction()

      try {
        // Retrieve platform hold days from Contents model
        const contents = await Contents.findOne({ isDeleted: false }).lean()
        const holdDays = contents?.paymentHoldDays || 7

        // Find all pending withdrawals
        const pendingWithdraws = await Withdraw.find({
          status: WITHDRAW_STATUS.proceed,
          isDeleted: false,
        }).session(session)

        for (const withdraw of pendingWithdraws) {
          const booking = await Booking.findById(withdraw.booking).session(
            session,
          )
          if (!booking) continue

          // Check if hold period has passed
          const requestDate = dayjs(withdraw.createdAt)
          const holdEndDate = requestDate.add(holdDays, 'day')

          if (dayjs().isAfter(holdEndDate, 'day')) {
            const consultant = await User.findById(booking.consult).session(
              session,
            )
            if (!consultant || !consultant.stripeAccountId) {
              console.warn(
                `No Stripe account for consultant ${booking.consult}`,
              )
              continue
            }

            try {
              const transfer = await StripeService.transfer(
                withdraw.amount * 100, // amount in cents
                consultant.stripeAccountId,
                'usd',
              )

              // Update withdrawal status
              withdraw.status = WITHDRAW_STATUS.completed
              withdraw.stripeTransferId = transfer.id
              await withdraw.save({ session })

              // Send completion notification
              await sendWithdrawNotify(
                WITHDRAW_STATUS.completed,
                withdraw,
                consultant,
              )

              console.log(
                `Transferred $${withdraw.amount} to ${consultant.stripeAccountId}`,
              )
            } catch (transferError: any) {
              console.error(
                `Transfer failed for withdraw ${withdraw._id}:`,
                transferError.message,
              )
            }
          }
        }

        await session.commitTransaction()
        console.log('Daily Withdraw Transfer Job Completed')
      } catch (error) {
        await session.abortTransaction()
        console.error('Daily Withdraw Transfer Job Failed:', error)
      } finally {
        session.endSession()
      }
    },
    { timezone: 'Europe/London' },
  )

  // 2. Daily review reminder job (midnight UK time)
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('Daily Review Reminder Job Started (UK time)')

      const twentyFourHoursAgo = dayjs().subtract(24, 'hour').toDate()
      const fortyEightHoursAgo = dayjs().subtract(48, 'hour').toDate()

      const completedBookings = await Booking.find({
        status: BOOKING_STATUS.completed,
        endTime: { $gte: fortyEightHoursAgo, $lte: twentyFourHoursAgo },
        isDeleted: false,
      })
        .select('user consult')
        .lean()

      console.log(
        `Found ${completedBookings.length} eligible bookings for review reminder`,
      )

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
          await notifyUserToLeaveReview(
            bookingId,
            userId,
            booking.consult.toString(),
          )
          console.log(
            `Review reminder sent for booking ${bookingId} to user ${userId}`,
          )
        } else {
          console.log(
            `Review already exists for booking ${bookingId} by user ${userId} — skipping`,
          )
        }
      }

      console.log('Daily Review Reminder Job Completed')
    },
    { timezone: 'Europe/London' },
  )

  // 3. Time-sensitive booking notifications (every 5 minutes)
  cron.schedule(
    '*/5 * * * *',
    async () => {
      console.log(
        'Time-Sensitive Booking Notifications Job Started (every 5 min)',
      )

      const now = dayjs().tz('Europe/London')
      const nowDate = now.format('YYYY-MM-DD')

      // Today's slots (distinct IDs only - very fast)
      const todaySlots = await BookingSlots.find({ date: nowDate }).distinct(
        '_id',
      )

      // Today's confirmed bookings (lean + minimal populate)
      const todayBookings = (await Booking.find({
        slot: { $in: todaySlots },
        status: 'confirmed',
        isDeleted: false,
      })
        .populate('user consult slot')
        .lean()) as any[]

      const notificationsToSend: {
        userId: string
        fcmToken: string
        action: string
        booking: any
        slot: any
      }[] = []

      const emailPromises: Promise<void>[] = []

      for (const booking of todayBookings) {
        const slot = booking.slot
        const bookingStart = dayjs(
          `${booking.slot.date} ${booking.slot.time}`,
          'YYYY-MM-DD HH:mm',
        ).tz(booking.timezone)

        const timeToStartMinutes = bookingStart.diff(now, 'minute')

        const user = booking.user
        const consult = booking.consult

        // 1. 10 minutes to go
        if (timeToStartMinutes >= 9 && timeToStartMinutes <= 10) {
          // Push notifications
          if (user?.fcmToken && user.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: user._id.toString(),
              fcmToken: user.fcmToken,
              action: '10min_reminder',
              booking,
              slot: booking.slot,
            })
          }
          if (consult?.fcmToken && consult.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: consult._id.toString(),
              fcmToken: consult.fcmToken,
              action: '10min_reminder',
              booking,
              slot: booking.slot,
            })
          }

          // Email to both
          if (user?.email && user.emailNotify?.schedule) {
            emailPromises.push(
              emailSender(
                user.email,
                'Session Starting in 10 Minutes',
                createReminderEmailContent(
                  user.firstName,
                  `${consult.firstName} ${consult.lastName}`,
                  `${slot.date} • ${slot.time} (${booking.timezone})`,
                  false,
                ),
              ).catch((err) =>
                console.error(`Email failed (user ${user._id}):`, err),
              ),
            )
          }

          if (consult?.email && consult.emailNotify?.schedule) {
            emailPromises.push(
              emailSender(
                consult.email,
                'Session Starting in 10 Minutes',
                createReminderEmailContent(
                  consult.firstName,
                  `${user.firstName} ${user.lastName}`,
                  `${slot.date} • ${slot.time} (${booking.timezone})`,
                  false,
                ),
              ).catch((err) =>
                console.error(`Email failed (consult ${consult._id}):`, err),
              ),
            )
          }
        }

        // 2. Join the call (0–1 minute before)
        if (timeToStartMinutes >= 0 && timeToStartMinutes <= 1) {
          if (user?.fcmToken && user.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: user._id.toString(),
              fcmToken: user.fcmToken,
              action: 'join_call',
              booking,
              slot: booking.slot,
            })
          }
          if (consult?.fcmToken && consult.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: consult._id.toString(),
              fcmToken: consult.fcmToken,
              action: 'join_call',
              booking,
              slot: booking.slot,
            })
          }

          // Email to both
          if (user?.email && user.emailNotify?.schedule) {
            emailPromises.push(
              emailSender(
                user.email,
                'Session Starting in 10 Minutes',
                createReminderEmailContent(
                  user.firstName,
                  `${consult.firstName} ${consult.lastName}`,
                  `${slot.date} • ${slot.time} (${booking.timezone})`,
                  false,
                ),
              ).catch((err) =>
                console.error(`Email failed (user ${user._id}):`, err),
              ),
            )
          }

          if (consult?.email && consult.emailNotify?.schedule) {
            emailPromises.push(
              emailSender(
                consult.email,
                'Session Starting in 10 Minutes',
                createReminderEmailContent(
                  consult.firstName,
                  `${user.firstName} ${user.lastName}`,
                  `${slot.date} • ${slot.time} (${booking.timezone})`,
                  false,
                ),
              ).catch((err) =>
                console.error(`Email failed (consult ${consult._id}):`, err),
              ),
            )
          }
        }

        // 3. DMs closing soon (59–61 minutes before closing)
        const dmCloseTime = bookingStart
          .add(booking.sessionDuration || 60, 'minute')
          .add(6, 'hour')
        const timeToDMCloseMinutes = dmCloseTime.diff(now, 'minute')

        if (timeToDMCloseMinutes >= 59 && timeToDMCloseMinutes <= 61) {
          if (user?.fcmToken && user.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: user._id.toString(),
              fcmToken: user.fcmToken,
              action: 'dms_closing',
              booking,
              slot: booking.slot,
            })
          }
          if (consult?.fcmToken && consult.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: consult._id.toString(),
              fcmToken: consult.fcmToken,
              action: 'dms_closing',
              booking,
              slot: booking.slot,
            })
          }
        }
      }

      // 4. Batch send notifications (chunked for performance)
      const chunkSize = 500
      for (let i = 0; i < notificationsToSend.length; i += chunkSize) {
        const chunk = notificationsToSend.slice(i, i + chunkSize)

        for (const n of chunk) {
          await sendBookingsNotification(
            n.action as TBookingNotifyAction,
            n.booking,
            await User.findById(n.userId).select('fcmToken pushNotify').lean(),
            n.slot,
          )
        }
      }

      console.log(
        `Time-sensitive notifications processed for ${notificationsToSend.length} recipients`,
      )
    },
    { timezone: 'Europe/London' },
  )

  console.log('All cron jobs initialized successfully')
}
