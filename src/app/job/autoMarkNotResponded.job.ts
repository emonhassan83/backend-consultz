// jobs/autoMarkNotResponded.job.ts
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
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

dayjs.extend(utc)
dayjs.extend(timezone)

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
})

export const autoMarkNotRespondedJob = async (): Promise<void> => {
  console.log('Auto-mark Not Responded Job Started')

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // ✅ Server এর current UTC time — booking এর timezone দিয়ে আলাদাভাবে check হবে
    const nowUtc = dayjs.utc()

    const oldConfirmedBookings = await Booking.find({
      status: BOOKING_STATUS.confirmed,
      isDeleted: false,
    })
      .populate('slot')
      .session(session)

    console.log(`Found ${oldConfirmedBookings.length} confirmed bookings to check`)

    // ✅ postCommitTasks — session commit এর পরে email/push পাঠাবো
    const postCommitTasks: (() => Promise<void>)[] = []

    let updatedCount = 0

    for (const booking of oldConfirmedBookings) {
      const slot = booking.slot as any

      if (!slot?.date || !slot?.time) {
        console.warn(`Booking ${booking._id} has no slot date/time — skipping`)
        continue
      }

      // ✅ booking.timezone use করে booking start time বের করো
      const bookingTimezone = booking.timezone || 'UTC'

      let bookingStartLocal: dayjs.Dayjs

      try {
        // booking এর local timezone এ start time parse করো
        bookingStartLocal = dayjs.tz(
          `${slot.date} ${slot.time}`,
          'YYYY-MM-DD HH:mm',
          bookingTimezone,
        )
      } catch {
        console.warn(`Invalid timezone "${bookingTimezone}" for booking ${booking._id} — falling back to UTC`)
        bookingStartLocal = dayjs.utc(`${slot.date} ${slot.time}`, 'YYYY-MM-DD HH:mm')
      }

      // ✅ UTC এ convert করে compare — timezone-safe
      const bookingStartUtc = bookingStartLocal.utc()
      const hoursSinceStart = nowUtc.diff(bookingStartUtc, 'hour', true)

      console.log(
        `Booking ${booking._id} | tz: ${bookingTimezone} | start: ${bookingStartLocal.format()} | hours since: ${hoursSinceStart.toFixed(2)}`,
      )

      // 24 ঘণ্টা পার না হলে skip
      if (hoursSinceStart < 24) continue

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
      let refundProcessed = false

      const payment = await Payment.findOne({
        booking: booking._id as any,
        isPaid: true,
        isDeleted: false,
      }).session(session)

      if (payment?.paymentIntentId) {
        try {
          await stripe.refunds.create({
            payment_intent: payment.paymentIntentId,
            amount: payment.amount * 100,
          })
          await Payment.updateOne(
            { _id: payment._id },
            { status: PAYMENT_STATUS.refunded },
            { session },
          )
          refundProcessed = true
          console.log(`✅ Refund processed for booking ${booking._id}`)
        } catch (refundError: any) {
          console.error(`Refund failed for booking ${booking._id}:`, refundError.message)
        }
      }

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
      const capturedRefundProcessed = refundProcessed

      postCommitTasks.push(async () => {
        if (booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
          await sendBookingsNotification('not_responded', capturedBooking, booker, slotInfo).catch(
            (err) => console.error(`Push failed (booker ${booker._id}):`, err),
          )
        }

        if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
          await sendBookingsNotification('not_responded', capturedBooking, expert, slotInfo).catch(
            (err) => console.error(`Push failed (expert ${expert._id}):`, err),
          )
        }

        if (booker && expert) {
          await sendNotRespondedEmail(
            booker as any,
            expert as any,
            capturedBooking as any,
            capturedRefundProcessed,
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