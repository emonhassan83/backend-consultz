// jobs/autoMarkNotResponded.job.ts
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import mongoose from 'mongoose'
import { Booking } from '../modules/booking/booking.models'
import { Payment } from '../modules/payment/payment.model'
import { User } from '../modules/user/user.model'
import { BOOKING_NO_SHOW_BY, BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { sendBookingsNotification } from '../modules/booking/booking.utils'
import { sendNotRespondedEmail, sendPaymentRefundToUser } from '../utils/emailNotify'
import { TUser } from '../modules/user/user.interface'
import {
  resolveBookingStartUtc,
} from './bookingJobTime.utils'
import { RefundService } from '../modules/refund/refund.service'
import { REFUND_BY } from '../modules/refund/refund.constant'
import { paymentNotifyToUser } from '../modules/payment/payment.utils'
import { Calling } from '../modules/calling/calling.model'
import { PAYMENT_SETTLEMENT_STATUS } from '../modules/payment/payment.constant'
import { getGeneralSettingNumber } from '../modules/contents/contents.utils'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

type TNoShowBy = keyof typeof BOOKING_NO_SHOW_BY

const resolveConfirmedNoShowBy = async (
  booking: any,
  session: mongoose.ClientSession,
): Promise<TNoShowBy | 'skip'> => {
  if (booking.sessionStartedAt) {
    return 'skip'
  }

  const consultId = String(booking.consult)
  const userId = String(booking.user)
  const calls = await Calling.find({
    booking: booking._id,
    isDeleted: false,
  }).session(session)

  let consulteeJoined = false
  let expertJoined = false

  for (const call of calls) {
    if (String(call.caller) === consultId && call.startedAt) {
      expertJoined = true
    }
    if (String(call.caller) === userId && call.startedAt) {
      consulteeJoined = true
    }

    for (const participant of call.participants || []) {
      if (!participant?.joinedAt) continue
      const participantId = String(participant.user)
      if (participantId === consultId) expertJoined = true
      if (participantId === userId) consulteeJoined = true
    }
  }

  if (consulteeJoined && expertJoined) {
    return 'skip'
  }
  if (!consulteeJoined && !expertJoined) {
    return BOOKING_NO_SHOW_BY.both
  }
  if (!consulteeJoined) {
    return BOOKING_NO_SHOW_BY.consultee
  }
  return BOOKING_NO_SHOW_BY.consultant
}

const isTransientMongoNetworkError = (error: any): boolean => {
  const labels = error?.errorLabels || []
  return (
    error?.errorLabelSet?.has?.('TransientTransactionError') ||
    labels.includes?.('TransientTransactionError') ||
    error?.code === 'ECONNRESET' ||
    error?.cause?.code === 'ECONNRESET' ||
    error?.message?.includes?.('ECONNRESET')
  )
}

const runAutoMarkNotRespondedJobOnce = async (): Promise<void> => {
  console.log('Auto-mark Not Responded Job Started')

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // âœ… Server à¦à¦° current UTC time â€” booking à¦à¦° timezone à¦¦à¦¿à¦¯à¦¼à§‡ à¦†à¦²à¦¾à¦¦à¦¾à¦­à¦¾à¦¬à§‡ check à¦¹à¦¬à§‡
    const nowUtc = dayjs.utc()

    const oldBookings = await Booking.find({
      status: { $in: [BOOKING_STATUS.confirmed, BOOKING_STATUS.pending] },
      paymentStatus: { $in: [PAYMENT_STATUS.authorized, PAYMENT_STATUS.paid] },
      isDeleted: false,
    }).session(session)

    console.log(`Found ${oldBookings.length} bookings to check`)

    // âœ… postCommitTasks â€” session commit à¦à¦° à¦ªà¦°à§‡ email/push à¦ªà¦¾à¦ à¦¾à¦¬à§‹
    const postCommitTasks: (() => Promise<void>)[] = []

    let updatedCount = 0

    for (const booking of oldBookings) {
      const bookingTimezone = booking.timezone || 'UTC'
      const bookingStartUtc = resolveBookingStartUtc(booking)

      if (!bookingStartUtc) {
        console.warn(`Booking ${booking._id} has no resolvable start time — skipping`)
        continue
      }

      const minutesSinceStart = nowUtc.diff(bookingStartUtc, 'minute', true)

      console.log(
        `Booking ${booking._id} | tz: ${bookingTimezone} | start: ${bookingStartUtc.tz(bookingTimezone).format()} | minutes since start: ${minutesSinceStart.toFixed(2)}`,
      )

      // Tracy operational rule: no-show/no-response must be checked 5 minutes
      // after scheduled start, regardless of session duration.
      if (minutesSinceStart < 5) continue

      if (booking.status === BOOKING_STATUS.confirmed) {
        const noShowBy = await resolveConfirmedNoShowBy(booking, session)
        if (noShowBy === 'skip') {
          console.log(`Booking ${booking._id} has session/call join activity; skipping no-show mark.`)
          continue
        }

        const markedBooking = await Booking.findOneAndUpdate(
          {
            _id: booking._id,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            updatedAt: booking.updatedAt,
          },
          {
            status: BOOKING_STATUS.not_responded,
            cancelledBy: 'system',
            noShowBy,
            respondedAt: new Date(),
          },
          { session, returnDocument: 'after' },
        )

        if (!markedBooking) {
          console.log(`Booking ${booking._id} changed while being checked; skipping stale expiry.`)
          continue
        }

        const payment = await Payment.findOne({
          booking: booking._id as any,
          status: { $in: [PAYMENT_STATUS.authorized, PAYMENT_STATUS.paid] },
          isDeleted: false,
        }).session(session)

        const shouldRefund = noShowBy === BOOKING_NO_SHOW_BY.consultant
        const shouldPayExpert = noShowBy === BOOKING_NO_SHOW_BY.consultee

        if (shouldPayExpert && payment?.status === PAYMENT_STATUS.paid) {
          const holdDays = await getGeneralSettingNumber('paymentHoldDays', 7)
          const holdUntil = dayjs.utc().add(holdDays, 'day').toDate()
          await Payment.findByIdAndUpdate(
            payment._id,
            {
              settlementStatus: PAYMENT_SETTLEMENT_STATUS.held,
              holdUntil,
              holdDaysSnapshot: holdDays,
              clearedAt: null,
              withdrawnAt: null,
            },
            { session },
          )
        }

        const [booker, expert] = await Promise.all([
          User.findById(booking.user)
            .select('_id firstName lastName email fcmToken pushNotify emailNotify')
            .session(session),
          User.findById(booking.consult)
            .select('_id firstName lastName email fcmToken pushNotify emailNotify')
            .session(session),
        ])

        const capturedBooking = booking
        const capturedPayment = payment

        postCommitTasks.push(async () => {
          let refundProcessed = false
          let authorizationReleased = false

          if (shouldRefund && capturedPayment?.paymentIntentId) {
            try {
              const paymentResult = await RefundService.releaseOrRefundPayment({
                payment: capturedPayment,
                reason: 'Expert did not join the session',
                refundedBy: REFUND_BY.system,
                idempotencyKey: `booking-not-responded-${capturedBooking._id}`,
              })
              refundProcessed = paymentResult.type === 'refund'
              authorizationReleased = paymentResult.type === 'authorization_released'
              if (refundProcessed && booker && paymentResult.refund) {
                await paymentNotifyToUser(
                  'REFUND',
                  capturedPayment as any,
                  booker as TUser,
                  paymentResult.refund,
                )
                await sendPaymentRefundToUser(
                  booker as TUser,
                  capturedPayment,
                  paymentResult.refund,
                  capturedBooking as any,
                )
              }
            } catch (refundError: any) {
              console.error(
                `Refund/authorization release failed for booking ${capturedBooking._id}:`,
                refundError.message,
              )
            }
          }

          if (booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
            await sendBookingsNotification('not_responded', capturedBooking, booker as TUser, expert as TUser).catch(
              (err) => console.error(`Push failed (booker ${booker._id}):`, err),
            )
          }

          if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
            await sendBookingsNotification('not_responded', capturedBooking, expert as TUser, expert as TUser, {
              otherPartyName: booker?.firstName || 'your client',
            }).catch(
              (err) => console.error(`Push failed (expert ${expert._id}):`, err),
            )
          }

          if (booker && expert) {
            await sendNotRespondedEmail(
              booker as any,
              expert as any,
              capturedBooking as any,
              refundProcessed,
              authorizationReleased,
            ).catch((err) => console.error(`Email failed for booking ${capturedBooking._id}:`, err))
          }
        })

        updatedCount++
        console.log(
          `Marked booking ${booking._id} as not_responded (${noShowBy}) | tz: ${bookingTimezone} | start: ${bookingStartUtc.tz(bookingTimezone).format('YYYY-MM-DD HH:mm z')}`,
        )
        continue
      }

      // Pending request expired: refund/release as before.
      const markedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          updatedAt: booking.updatedAt,
        },
        {
          status: BOOKING_STATUS.not_responded,
          cancelledBy: 'system',
          respondedAt: new Date(),
        },
        { session, returnDocument: 'after' },
      )

      // The booking was rescheduled/updated after this job read it. Never mark
      // a stale schedule as not responded.
      if (!markedBooking) {
        console.log(`Booking ${booking._id} changed while being checked; skipping stale expiry.`)
        continue
      }

      // â”€â”€ Refund â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const payment = await Payment.findOne({
        booking: booking._id as any,
        status: { $in: [PAYMENT_STATUS.authorized, PAYMENT_STATUS.paid] },
        isDeleted: false,
      }).session(session)

      // â”€â”€ Fetch user data for notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const [booker, expert] = await Promise.all([
        User.findById(booking.user)
          .select('_id firstName lastName email fcmToken pushNotify emailNotify')
          .session(session),
        User.findById(booking.consult)
          .select('_id firstName lastName email fcmToken pushNotify emailNotify')
          .session(session),
      ])

      // âœ… Session commit à¦à¦° à¦ªà¦°à§‡ push/email à¦ªà¦¾à¦ à¦¾à¦¬à§‹
      const capturedBooking = booking
      const capturedPayment = payment

      postCommitTasks.push(async () => {
        let refundProcessed = false
        let authorizationReleased = false

        // Run Stripe only after MongoDB commits. The idempotency key prevents
        // duplicate refunds if this task is retried.
        if (capturedPayment?.paymentIntentId) {
          try {
            const paymentResult = await RefundService.releaseOrRefundPayment({
              payment: capturedPayment,
              reason: 'Booking not accepted',
              refundedBy: REFUND_BY.system,
              idempotencyKey: `booking-not-responded-${capturedBooking._id}`,
            })
            refundProcessed = paymentResult.type === 'refund'
            authorizationReleased = paymentResult.type === 'authorization_released'
            if (refundProcessed && booker && paymentResult.refund) {
              await paymentNotifyToUser(
                'REFUND',
                capturedPayment as any,
                booker as TUser,
                paymentResult.refund,
              )
              await sendPaymentRefundToUser(
                booker as TUser,
                capturedPayment,
                paymentResult.refund,
                capturedBooking as any,
              )
            }
            console.log(
              authorizationReleased
                ? `Payment authorization released for booking ${capturedBooking._id}`
                : `Refund processed for booking ${capturedBooking._id}`,
            )
          } catch (refundError: any) {
            console.error(
              `Refund/authorization release failed for booking ${capturedBooking._id}:`,
              refundError.message,
            )
          }
        }

        if (booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
          await sendBookingsNotification('not_responded', capturedBooking, booker as TUser, expert as TUser).catch(
            (err) => console.error(`Push failed (booker ${booker._id}):`, err),
          )
        }

        if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
          await sendBookingsNotification('not_responded', capturedBooking, expert as TUser, expert as TUser, {
            otherPartyName: booker?.firstName || 'your client',
          }).catch(
            (err) => console.error(`Push failed (expert ${expert._id}):`, err),
          )
        }

        if (booker && expert) {
          await sendNotRespondedEmail(
            booker as any,
            expert as any,
            capturedBooking as any,
            refundProcessed,
            authorizationReleased,
          ).catch((err) => console.error(`Email failed for booking ${capturedBooking._id}:`, err))
        }
      })

      updatedCount++
      console.log(
        `Marked booking ${booking._id} as not_responded | tz: ${bookingTimezone} | start: ${bookingStartUtc.tz(bookingTimezone).format('YYYY-MM-DD HH:mm z')}`,
      )
    }

    await session.commitTransaction()
    console.log(`Auto-mark Not Responded Job Completed â€” ${updatedCount} bookings updated`)

    // âœ… Session commit à¦à¦° à¦ªà¦°à§‡ push/email à¦ªà¦¾à¦ à¦¾à¦“
    await Promise.allSettled(postCommitTasks.map((task) => task()))
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction().catch((abortError) =>
        console.error('Auto-mark Not Responded abort failed:', abortError),
      )
    }
    throw error
  } finally {
    session.endSession()
  }
}

export const autoMarkNotRespondedJob = async (): Promise<void> => {
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runAutoMarkNotRespondedJobOnce()
      return
    } catch (error) {
      if (attempt < maxAttempts && isTransientMongoNetworkError(error)) {
        console.warn(
          `Auto-mark Not Responded Job transient Mongo error; retrying attempt ${attempt + 1}/${maxAttempts}`,
          error,
        )
        continue
      }

      console.error('Auto-mark Not Responded Job Failed:', error)
      return
    }
  }
}

