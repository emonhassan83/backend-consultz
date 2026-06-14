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
import { Withdraw } from '../modules/withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../modules/withdraw/withdraw.constant'
import StripeService from '../class/stripe/stripe'
import { sendWithdrawNotify } from '../modules/withdraw/withdraw.utils'
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
} from '../modules/booking/booking.constants'
import { Reviews } from '../modules/review/review.models'
import { notifyUserToLeaveReview } from '../modules/review/review.utils'
import emailSender from './emailSender'
import {
  createReminderEmailContent,
  sendNotRespondedEmail,
  sendWithdrawCompletedEmail,
} from './emailNotify'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { sendNotification } from './sentNotification'
import { Payment } from '../modules/payment/payment.model'
import Stripe from 'stripe'
import config from '../config'
import { modeType } from '../modules/notification/notification.interface'
import { TBookings } from '../modules/booking/booking.interface'

const TIMEZONE = 'Asia/Dhaka'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
})

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
        // ✅ proceed + hold দুটোই fetch করো
        const pendingWithdraws = await Withdraw.find({
          status: { $in: [WITHDRAW_STATUS.proceed, WITHDRAW_STATUS.hold] },
          isDeleted: false,
          proceedAt: { $exists: true },
        }).session(session)

        console.log(
          `Found ${pendingWithdraws.length} pending withdrawals to process`,
        )

        const postCommitTasks: (() => Promise<void>)[] = []

        for (const withdraw of pendingWithdraws) {
          // ✅ hold status গুলোর জন্য proceedAt check skip করো
          // কারণ তাদের proceedAt আগেই পার হয়ে গেছে, শুধু stripe ছিল না
          if (
            withdraw.status === WITHDRAW_STATUS.proceed &&
            !dayjs().isAfter(withdraw.proceedAt)
          ) {
            console.log(
              `Withdraw ${withdraw._id} not yet eligible (proceedAt: ${withdraw.proceedAt})`,
            )
            continue
          }

          const booking = await Booking.findById(withdraw.booking)
            .populate('slot user')
            .session(session)

          if (!booking) {
            console.warn(`Booking not found for withdraw ${withdraw._id}`)
            continue
          }

          const consultant = await User.findById(booking.consult).session(
            session,
          )

          if (!consultant) {
            console.warn(`Consultant not found for booking ${booking._id}`)
            continue
          }

          // ✅ এখনও stripe নেই — hold রাখো (already hold, skip)
          if (!consultant.stripeAccountId) {
            if (withdraw.status !== WITHDRAW_STATUS.hold) {
              withdraw.status = WITHDRAW_STATUS.hold
              await withdraw.save({ session })
            }

            console.warn(
              `Still no Stripe account for consultant ${consultant._id} — withdraw ${withdraw._id} remains on hold`,
            )

            postCommitTasks.push(async () => {
              if (consultant.fcmToken && consultant.pushNotify?.payment) {
                await sendNotification([consultant.fcmToken], {
                  receiver: consultant._id,
                  message: 'Action Required: Connect Your Stripe Account',
                  description:
                    'Your withdrawal is on hold. Please connect your Stripe account to receive your earnings.',
                  reference: withdraw._id,
                  modelType: modeType.Payment,
                })
              }

              if (consultant.email && consultant.emailNotify?.payment) {
                await emailSender(
                  consultant.email,
                  'Withdrawal On Hold – Stripe Connection Required',
                  `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h2 style="color: #333;">Withdrawal On Hold</h2>
                    <p style="color: #555;">Dear ${consultant.firstName},</p>
                    <p style="color: #555;">Your withdrawal request of <strong>$${withdraw.amount.toFixed(2)}</strong> is still on hold.</p>
                    <p style="color: #555;">Please connect your Stripe account through the Consultz app to receive your earnings.</p>
                    <ul style="color: #555; line-height: 1.6;">
                      <li><strong>Amount:</strong> $${withdraw.amount.toFixed(2)}</li>
                      <li><strong>Status:</strong> On Hold</li>
                      <li><strong>Reason:</strong> Stripe account not connected</li>
                    </ul>
                    <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
                    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                      <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
                    </div>
                  </div>
                `,
                ).catch((err) =>
                  console.error(
                    `Hold email failed for consultant ${consultant._id}:`,
                    err,
                  ),
                )
              }
            })

            continue
          }

          // ✅ Stripe এখন connected — transfer করো (proceed বা hold যাই হোক)
          try {
            console.log(
              `Processing withdraw ${withdraw._id} (was: ${withdraw.status}) — Stripe now connected`,
            )

            const transfer = await StripeService.transfer(
              withdraw.amount * 100,
              consultant.stripeAccountId,
              'usd',
            )

            withdraw.status = WITHDRAW_STATUS.completed
            withdraw.stripeTransferId = transfer.id
            await withdraw.save({ session })

            console.log(
              `Transferred $${withdraw.amount} to ${consultant.stripeAccountId} for withdraw ${withdraw._id}`,
            )

            const booker = await User.findById(booking.user).session(
            session,
          )

            postCommitTasks.push(async () => {
              await sendWithdrawNotify(
                WITHDRAW_STATUS.completed,
                withdraw,
                consultant,
              )
            })

            if (booker && consultant.emailNotify?.payment) {
              postCommitTasks.push(async () => {
                await sendWithdrawCompletedEmail(
                  consultant,
                  withdraw,
                  booking,
                  booker,
                )
              })
            }
          } catch (transferError: any) {
            console.error(
              `Transfer failed for withdraw ${withdraw._id}:`,
              transferError.message,
            )
          }
        }

        await session.commitTransaction()
        console.log('Daily Withdraw Transfer Job Completed')

        await Promise.allSettled(postCommitTasks.map((task) => task()))
      } catch (error) {
        await session.abortTransaction()
        console.error('Daily Withdraw Transfer Job Failed:', error)
      } finally {
        session.endSession()
      }
    },
    { timezone: TIMEZONE },
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
    { timezone: TIMEZONE },
  )

  // 3. expertReliabilityReward.job.ts (daily at midnight)
  cron.schedule(
    '0 0 * * *',
    async () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // Find all experts
      const experts = await User.find({
        role: USER_ROLE.expert,
        status: USER_STATUS.active,
        isDeleted: false,
      }).select('_id points fcmToken pushNotify')

      for (const expert of experts) {
        // Check no-show in last 30 days
        const noShowCount = await Booking.countDocuments({
          consult: expert._id,
          status: BOOKING_STATUS.not_responded, // assuming you have this status
          updatedAt: { $gte: thirtyDaysAgo },
          isDeleted: false,
        })

        if (noShowCount === 0) {
          // Award 300 points
          expert.points = (expert.points || 0) + 300
          await expert.save()

          // Send push notification (if enabled)
          if (expert.fcmToken && expert.pushNotify?.points) {
            await sendNotification([expert.fcmToken], {
              receiver: expert._id,
              message: 'Reliability Bonus Awarded!',
              description:
                'Congratulations! You had zero no-shows in the last 30 days and earned 300 points. Keep it up! 🎉',
              reference: expert._id,
              modelType: modeType.Achievement,
            })
          }
        }
      }
    },
    { timezone: TIMEZONE },
  )

  // 4. expertResponseTimeReward.job.ts (weekly, e.g., every Sunday midnight)
  cron.schedule(
    '0 0 * * 0',
    async () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const experts = await User.find({
        role: USER_ROLE.expert,
        status: USER_STATUS.active,
        isDeleted: false,
      }).select('_id points fcmToken pushNotify')

      for (const expert of experts) {
        // Find all pending booking requests in last 7 days
        const pendingRequests = await Booking.find({
          consult: expert._id,
          status: BOOKING_STATUS.pending,
          createdAt: { $gte: sevenDaysAgo },
          isDeleted: false,
        }).select('_id createdAt')

        const totalRequests = pendingRequests.length
        if (totalRequests === 0) continue

        // Count how many were responded within 30 minutes
        let fastResponses = 0

        for (const req of pendingRequests) {
          // Assuming you have a field 'respondedAt' or use updatedAt when status changed
          const responseTimeMinutes = dayjs(req.updatedAt).diff(
            req.createdAt,
            'minute',
          )

          if (responseTimeMinutes <= 30) {
            fastResponses++
          }
        }

        // If 80% or more requests were fast
        const fastResponseRate = (fastResponses / totalRequests) * 100
        if (fastResponseRate >= 80) {
          expert.points = (expert.points || 0) + 50
          await expert.save()

          // Send push notification
          if (expert.fcmToken && expert.pushNotify?.points) {
            await sendNotification([expert.fcmToken], {
              receiver: expert._id,
              message: 'Fast Response Reward!',
              description:
                'You earned 50 points this week for maintaining fast response time to booking requests. Excellent! 🎉',
              reference: expert._id,
              modelType: modeType.Achievement,
            })
          }
        }
      }
    },
    { timezone: TIMEZONE },
  )

  // 5. Time-sensitive booking notifications (every 5 minutes)
  cron.schedule(
    '*/5 * * * *',
    async () => {
      console.log(
        'Time-Sensitive Booking Notifications Job Started (every 5 min)',
      )

      const now = dayjs().tz(TIMEZONE)
      const nowDate = now.format('YYYY-MM-DD')

      const todaySlots = await BookingSlots.find({ date: nowDate }).distinct(
        '_id',
      )

      // ✅ slot মাত্র populate করো, user/consult বাদ
      const todayBookings = (await Booking.find({
        slot: { $in: todaySlots },
        status: 'confirmed',
        isDeleted: false,
      })
        .populate('slot')
        .lean()) as any[]

      // ✅ Unique user & consult IDs collect করো
      const userIds = [...new Set(todayBookings.map((b) => b.user.toString()))]
      const consultIds = [
        ...new Set(todayBookings.map((b) => b.consult.toString())),
      ]
      const allIds = [...new Set([...userIds, ...consultIds])]

      // ✅ User model fetch
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

        // ✅ Map থেকে user & consult নাও
        const user = userMap.get(booking.user.toString())
        const consult = userMap.get(booking.consult.toString())

        if (!user || !consult) continue

        const bookingStart = dayjs(
          `${slot.date} ${slot.time}`,
          'YYYY-MM-DD HH:mm',
        ).tz(booking.timezone)

        const timeToStartMinutes = bookingStart.diff(now, 'minute')

        const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

        // 1. 10 minutes to go
        if (timeToStartMinutes >= 9 && timeToStartMinutes <= 10) {
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
              ).catch((err) =>
                console.error(`Email failed (user ${user._id}):`, err),
              ),
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
              ).catch((err) =>
                console.error(`Email failed (consult ${consult._id}):`, err),
              ),
            )
          }
        }

        // 2. Join the call (0–1 minute before)
        if (timeToStartMinutes >= 0 && timeToStartMinutes <= 1) {
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
              ).catch((err) =>
                console.error(`Email failed (user ${user._id}):`, err),
              ),
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
          if (user.fcmToken && user.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: user._id.toString(),
              fcmToken: user.fcmToken,
              action: 'dms_closing',
              booking,
              slot,
            })
          }
          if (consult.fcmToken && consult.pushNotify?.scheduleRemainder) {
            notificationsToSend.push({
              userId: consult._id.toString(),
              fcmToken: consult.fcmToken,
              action: 'dms_closing',
              booking,
              slot,
            })
          }
        }
      }

      // 4. Emails batch send
      await Promise.allSettled(emailPromises)

      // 5. Notifications batch send (chunked)
      const chunkSize = 500
      for (let i = 0; i < notificationsToSend.length; i += chunkSize) {
        const chunk = notificationsToSend.slice(i, i + chunkSize)
        await Promise.allSettled(
          chunk.map((n) =>
            sendBookingsNotification(
              n.action as TBookingNotifyAction,
              n.booking,
              userMap.get(n.userId),
              n.slot,
            ),
          ),
        )
      }

      console.log(
        `Time-sensitive notifications processed for ${notificationsToSend.length} recipients`,
      )
    },
    { timezone: TIMEZONE },
  )

  // 6. Auto-mark old confirmed bookings as "not_responded" + free slot + refund
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('Auto-mark Not Responded Job Started at 12:00 AM UK time')

      const session = await mongoose.startSession()
      session.startTransaction()

      try {
        const now = dayjs().tz(TIMEZONE)
        const thresholdTime = now.subtract(24, 'hour') // 24 hours after slot time

        // Find confirmed bookings that are overdue and not yet completed
        const oldConfirmedBookings = await Booking.find({
          status: BOOKING_STATUS.confirmed,
          isDeleted: false,
        })
          .populate('slot user consult')
          .session(session)

        let updatedCount = 0

        for (const booking of oldConfirmedBookings) {
          const slot = booking.slot as any

          // Calculate actual booking start time in user's timezone
          const bookingStart = dayjs.tz(
            `${slot.date} ${slot.time}`,
            'YYYY-MM-DD HH:mm',
            booking.timezone,
          )

          // If 24+ hours have passed since slot time and still not completed
          if (bookingStart.isBefore(thresholdTime)) {
            // 1. Mark booking as not_responded
            await Booking.findByIdAndUpdate(
              booking._id,
              {
                status: BOOKING_STATUS.not_responded,
                respondedAt: new Date(),
              },
              { session },
            )

            // 2. Free the slot
            await BookingSlots.findByIdAndUpdate(
              booking.slot,
              { isBooked: false },
              { session },
            )

            // 3. Refund process (same as declineBooking)
            let refundProcessed = false
            let refundAmount = 0

            const payment = await Payment.findOne({
              booking: booking._id as any,
              isPaid: true,
              isDeleted: false,
            }).session(session)

            if (payment && payment.paymentIntentId) {
              try {
                const refund = await stripe.refunds.create({
                  payment_intent: payment.paymentIntentId,
                  amount: payment.amount * 100,
                })

                await Payment.updateOne(
                  { _id: payment._id },
                  { status: PAYMENT_STATUS.refunded },
                  { session },
                )

                refundProcessed = true
                refundAmount = refund.amount / 100
              } catch (refundError: any) {
                console.error(
                  `Refund failed for booking ${booking._id}:`,
                  refundError.message,
                )
              }
            }

            // 4. Notify both user and consultant
            const [booker, expert] = await Promise.all([
              User.findById(booking.user)
                .select('fcmToken pushNotify emailNotify')
                .session(session),
              User.findById(booking.consult)
                .select('fcmToken pushNotify emailNotify')
                .session(session),
            ])

            const slotInfo = await BookingSlots.findById(booking.slot).session(
              session,
            )

            // Push notifications
            if (booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
              await sendBookingsNotification(
                'not_responded',
                booking,
                booker,
                slotInfo,
              )
            }

            if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
              await sendBookingsNotification(
                'not_responded',
                booking,
                expert,
                slotInfo,
              )
            }

            // Email notification to booker (user)
            if (booker && expert && slotInfo) {
              await sendNotRespondedEmail(
                booker,
                expert,
                booking,
                refundProcessed,
              )
            }

            updatedCount++
            console.log(
              `Marked booking ${booking._id} as not_responded and processed refund`,
            )
          }
        }

        await session.commitTransaction()
        console.log(
          `Auto-mark Not Responded Job Completed - ${updatedCount} bookings updated`,
        )
      } catch (error) {
        await session.abortTransaction()
        console.error('Auto-mark Not Responded Job Failed:', error)
      } finally {
        session.endSession()
      }
    },
    { timezone: TIMEZONE },
  )

  console.log('All cron jobs initialized successfully')
}
