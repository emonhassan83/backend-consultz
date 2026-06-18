import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
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

dayjs.extend(timezone)

const TIMEZONE = 'Asia/Dhaka'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
})

export const autoMarkNotRespondedJob = async (): Promise<void> => {
  console.log('Auto-mark Not Responded Job Started')

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const now = dayjs().tz(TIMEZONE)
    const thresholdTime = now.subtract(24, 'hour')

    const oldConfirmedBookings = await Booking.find({
      status: BOOKING_STATUS.confirmed,
      isDeleted: false,
    })
      .populate('slot user consult')
      .session(session)

    let updatedCount = 0

    for (const booking of oldConfirmedBookings) {
      const slot = booking.slot as any
      const bookingStart = dayjs.tz(
        `${slot.date} ${slot.time}`,
        'YYYY-MM-DD HH:mm',
        booking.timezone,
      )

      if (!bookingStart.isBefore(thresholdTime)) continue

      await Booking.findByIdAndUpdate(
        booking._id,
        { status: BOOKING_STATUS.not_responded, respondedAt: new Date() },
        { session },
      )

      await BookingSlots.findByIdAndUpdate(booking.slot, { isBooked: false }, { session })

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
          await Payment.updateOne({ _id: payment._id }, { status: PAYMENT_STATUS.refunded }, { session })
          refundProcessed = true
        } catch (refundError: any) {
          console.error(`Refund failed for booking ${booking._id}:`, refundError.message)
        }
      }

      const [booker, expert] = await Promise.all([
        User.findById(booking.user).select('fcmToken pushNotify emailNotify').session(session),
        User.findById(booking.consult).select('fcmToken pushNotify emailNotify').session(session),
      ])

      const slotInfo = await BookingSlots.findById(booking.slot).session(session)

      if (booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
        await sendBookingsNotification('not_responded', booking, booker, slotInfo)
      }
      if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
        await sendBookingsNotification('not_responded', booking, expert, slotInfo)
      }
      if (booker && expert && slotInfo) {
        await sendNotRespondedEmail(booker, expert, booking, refundProcessed)
      }

      updatedCount++
      console.log(`Marked booking ${booking._id} as not_responded`)
    }

    await session.commitTransaction()
    console.log(`Auto-mark Not Responded Job Completed — ${updatedCount} bookings updated`)
  } catch (error) {
    await session.abortTransaction()
    console.error('Auto-mark Not Responded Job Failed:', error)
  } finally {
    session.endSession()
  }
}