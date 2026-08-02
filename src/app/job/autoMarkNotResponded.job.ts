// jobs/autoMarkNotResponded.job.ts
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import mongoose from 'mongoose'
import Stripe from 'stripe'
import { Booking } from '../modules/booking/booking.models'
import { Payment } from '../modules/payment/payment.model'
import { User } from '../modules/user/user.model'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { sendBookingsNotification } from '../modules/booking/booking.utils'
import { sendNotRespondedEmail } from '../utils/emailNotify'
import config from '../config'
import { TUser } from '../modules/user/user.interface'
import {
  resolveBookingEndUtc,
  resolveBookingStartUtc,
} from './bookingJobTime.utils'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

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
      paymentStatus: PAYMENT_STATUS.paid,
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
      const bookingEndUtc = resolveBookingEndUtc(booking)
      const minutesSinceEnd = bookingEndUtc
        ? nowUtc.diff(bookingEndUtc, 'minute', true)
        : minutesSinceStart - booking.sessionDuration

      console.log(
        `Booking ${booking._id} | tz: ${bookingTimezone} | start: ${bookingStartUtc.tz(bookingTimezone).format()} | minutes since start: ${minutesSinceStart.toFixed(2)}`,
      )

      if (booking.status === BOOKING_STATUS.confirmed) {
        if (minutesSinceEnd < 0) continue
      } else if (booking.status === BOOKING_STATUS.pending) {
        // Give the expert a short grace period at the scheduled start before
        // expiring an unaccepted request and refunding the consultee.
        if (minutesSinceStart < 5) continue
      }

      // â”€â”€ Mark as not_responded â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const markedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          status: booking.status,
          paymentStatus: PAYMENT_STATUS.paid,
          updatedAt: booking.updatedAt,
        },
        { status: BOOKING_STATUS.not_responded, respondedAt: new Date() },
        { session, new: true },
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
        isPaid: true,
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

        // Run Stripe only after MongoDB commits. The idempotency key prevents
        // duplicate refunds if this task is retried.
        if (capturedPayment?.paymentIntentId) {
          try {
            await stripe.refunds.create(
              {
                payment_intent: capturedPayment.paymentIntentId,
                amount: Math.round(capturedPayment.amount * 100),
              },
              { idempotencyKey: `booking-not-responded-${capturedBooking._id}` },
            )
            await Payment.updateOne(
              { _id: capturedPayment._id },
              { status: PAYMENT_STATUS.refunded },
            )
            refundProcessed = true
            console.log(`Refund processed for booking ${capturedBooking._id}`)
          } catch (refundError: any) {
            console.error(
              `Refund failed for booking ${capturedBooking._id}:`,
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

