// jobs/autoMarkNotResponded.job.ts
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import mongoose from 'mongoose'
import Stripe from 'stripe'
import { Booking } from '../modules/booking/booking.models'
import { BookingSlots } from '../modules/bookingSlots/bookingSlots.model'
import { Payment } from '../modules/payment/payment.model'
import { User } from '../modules/user/user.model'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { sendBookingsNotification } from '../modules/booking/booking.utils'
import { sendNotRespondedEmail } from '../utils/emailNotify'
import config from '../config'
import { TUser } from '../modules/user/user.interface'
import { TBookingSlots } from '../modules/bookingSlots/bookingSlots.interface'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

export const autoMarkNotRespondedJob = async (): Promise<void> => {
  console.log('Auto-mark Not Responded Job Started')

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // ✅ Server এর current UTC time — booking এর timezone দিয়ে আলাদাভাবে check হবে
    const nowUtc = dayjs.utc()

    const oldBookings = await Booking.find({
      status: { $in: [BOOKING_STATUS.confirmed, BOOKING_STATUS.pending] },
      isDeleted: false,
    })
      .populate('slot')
      .session(session)

    console.log(`Found ${oldBookings.length} bookings to check`)

    // ✅ postCommitTasks — session commit এর পরে email/push পাঠাবো
    const postCommitTasks: (() => Promise<void>)[] = []

    let updatedCount = 0

    for (const booking of oldBookings) {
      const slot = booking.slot as any

      if (!slot?.date || !slot?.time) {
        console.warn(`Booking ${booking._id} has no slot date/time — skipping`)
        continue
      }

      // ✅ booking.timezone use করে booking start time বের করো
      const bookingTimezone = booking.timezone || 'UTC'
      const hasValidLocalDateTime = Boolean(
        booking.localDate &&
        booking.localTime &&
        dayjs(`${booking.localDate} ${booking.localTime}`, 'YYYY-MM-DD HH:mm', true).isValid(),
      )
      const bookingDate = hasValidLocalDateTime ? booking.localDate : slot.date
      const bookingTime = hasValidLocalDateTime ? booking.localTime : slot.time

      let bookingStartLocal: dayjs.Dayjs

      try {
        // booking এর local timezone এ start time parse করো
        bookingStartLocal = dayjs.tz(
          `${bookingDate} ${bookingTime}`,
          'YYYY-MM-DD HH:mm',
          bookingTimezone,
        )
      } catch {
        console.warn(`Invalid timezone "${bookingTimezone}" for booking ${booking._id} — falling back to UTC`)
        bookingStartLocal = dayjs.utc(`${bookingDate} ${bookingTime}`, 'YYYY-MM-DD HH:mm')
      }

      // ✅ UTC এ convert করে compare — timezone-safe
      const bookingStartUtc = bookingStartLocal.utc()
      const minutesSinceStart = nowUtc.diff(bookingStartUtc, 'minute', true)

      console.log(
        `Booking ${booking._id} | tz: ${bookingTimezone} | start: ${bookingStartLocal.format()} | minutes since start: ${minutesSinceStart.toFixed(2)}`,
      )

      if (booking.status === BOOKING_STATUS.confirmed) {
        if (minutesSinceStart < booking.sessionDuration) continue
      } else if (booking.status === BOOKING_STATUS.pending) {
        // Give the expert a short grace period at the scheduled start before
        // expiring an unaccepted request and refunding the consultee.
        if (minutesSinceStart < 5) continue
      }

      // ── Mark as not_responded ──────────────────────────────────────────────
      await Booking.findByIdAndUpdate(
        booking._id,
        { status: BOOKING_STATUS.not_responded, respondedAt: new Date() },
        { session },
      )

      await BookingSlots.findByIdAndUpdate(
        booking.slot,
        { isBooked: false },
        { session },
      )

      // ── Refund ────────────────────────────────────────────────────────────
      const payment = await Payment.findOne({
        booking: booking._id as any,
        isPaid: true,
        isDeleted: false,
      }).session(session)

      // ── Fetch user data for notifications ─────────────────────────────────
      const [booker, expert, slotInfo] = await Promise.all([
        User.findById(booking.user)
          .select('_id firstName lastName email fcmToken pushNotify emailNotify')
          .session(session),
        User.findById(booking.consult)
          .select('_id firstName lastName email fcmToken pushNotify emailNotify')
          .session(session),
        BookingSlots.findById(booking.slot).session(session),
      ])

      // ✅ Session commit এর পরে push/email পাঠাবো
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
          await sendBookingsNotification('not_responded', capturedBooking, booker as TUser, expert as TUser, slotInfo as TBookingSlots).catch(
            (err) => console.error(`Push failed (booker ${booker._id}):`, err),
          )
        }

        if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
          await sendBookingsNotification('not_responded', capturedBooking, expert as TUser, expert as TUser, slotInfo as TBookingSlots, {
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
        `Marked booking ${booking._id} as not_responded | tz: ${bookingTimezone} | start: ${bookingStartLocal.format('YYYY-MM-DD HH:mm z')}`,
      )
    }

    await session.commitTransaction()
    console.log(`Auto-mark Not Responded Job Completed — ${updatedCount} bookings updated`)

    // ✅ Session commit এর পরে push/email পাঠাও
    await Promise.allSettled(postCommitTasks.map((task) => task()))
  } catch (error) {
    await session.abortTransaction()
    console.error('Auto-mark Not Responded Job Failed:', error)
  } finally {
    session.endSession()
  }
}
