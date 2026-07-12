// Runs every minute. Finds all `running` bookings whose sessionDuration has elapsed
// and auto-completes them + creates a withdraw request for the expert.
// This is a fallback for when the socket `bookingComplete` event is missed.
import dayjs from 'dayjs'
import mongoose from 'mongoose'
import { Booking } from '../modules/booking/booking.models'
import { Payment } from '../modules/payment/payment.model'
import { Withdraw } from '../modules/withdraw/withdraw.model'
import { User } from '../modules/user/user.model'
import { Contents } from '../modules/contents/contents.models'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { WITHDRAW_STATUS } from '../modules/withdraw/withdraw.constant'
import { sendWithdrawNotify } from '../modules/withdraw/withdraw.utils'
import { sendSessionCompletedToConsultant } from '../utils/emailNotify'
import { TPayment } from '../modules/payment/payment.interface'

export const sessionCompleteCheckJob = async (): Promise<void> => {
  console.log('Session Complete Check Job started')

  const now = dayjs()

  const runningBookings = await Booking.find({
    status: BOOKING_STATUS.running,
    paymentStatus: PAYMENT_STATUS.paid,
    isDeleted: false,
    sessionStartedAt: { $exists: true, $ne: null },
  }).lean()

  if (runningBookings.length === 0) {
    console.log('Session Complete Check Job: no running bookings')
    return
  }

  console.log(
    `Session Complete Check Job: ${runningBookings.length} running bookings found`,
  )

  const paymentHoldDaysContent = await Contents.findOne({ key: 'paymentHoldDays' }).lean()
  const holdDays = paymentHoldDaysContent?.value || 7
  let completedCount = 0

  for (const booking of runningBookings) {
    // Skip if session duration has not yet elapsed
    const sessionEnd = dayjs(booking.sessionStartedAt).add(
      booking.sessionDuration,
      'minute',
    )
    if (now.isBefore(sessionEnd)) continue

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      // Re-fetch inside transaction to guard against race with socket handler
      const liveBooking = await Booking.findOne({
        _id: booking._id,
        status: BOOKING_STATUS.running,
        paymentStatus: PAYMENT_STATUS.paid,
      }).session(session)

      if (!liveBooking) {
        // Socket handler already completed it — nothing to do
        await session.abortTransaction()
        continue
      }

      // Idempotency: skip if withdraw already exists (created by socket handler)
      const existingWithdraw = await Withdraw.findOne({
        booking: booking._id.toString(),
      }).session(session)
      if (existingWithdraw) {
        // Withdraw exists but booking still shows running — just mark it completed
        await Booking.findByIdAndUpdate(
          booking._id,
          { status: BOOKING_STATUS.completed },
          { session },
        )
        await session.commitTransaction()
        console.log(
          `Booking ${booking._id}: withdraw existed, marked completed`,
        )
        continue
      }

      const payment: TPayment | null = await Payment.findOne({
        booking: booking._id.toString(),
        isPaid: true,
        isDeleted: false,
      }).session(session)

      if (!payment) {
        await session.abortTransaction()
        console.warn(`Booking ${booking._id}: no paid payment found — skipping`)
        continue
      }

      // Mark booking completed
      await Booking.findByIdAndUpdate(
        booking._id,
        { status: BOOKING_STATUS.completed },
        { session },
      )

      // Create withdraw request
      const proceedAt = dayjs().add(holdDays, 'day').toDate()
      const [withdraw] = await Withdraw.create(
        [
          {
            user: booking.consult,
            booking: booking._id,
            amount: payment.consultAmount,
            status: WITHDRAW_STATUS.proceed,
            proceedAt,
          },
        ] as any,
        { session },
      )

      await session.commitTransaction()
      completedCount++

      // Post-commit: push + email (failures must not roll back the DB write)
      const [consultant, booker] = await Promise.all([
        User.findById(booking.consult).select(
          '_id firstName lastName email fcmToken pushNotify emailNotify',
        ),
        User.findById(booking.user).select('_id firstName lastName email'),
      ])

      if (consultant?.fcmToken) {
        await sendWithdrawNotify(
          WITHDRAW_STATUS.proceed,
          withdraw,
          consultant as any,
        ).catch((err) =>
          console.error(`Push failed (booking ${booking._id}):`, err),
        )
      }

      if (consultant?.emailNotify?.payment && booker) {
        await sendSessionCompletedToConsultant(
          consultant as any,
          booking as any,
          booker as any,
          payment,
          holdDays,
        ).catch((err) =>
          console.error(`Email failed (booking ${booking._id}):`, err),
        )
      }

      console.log(
        `✅ Booking ${booking._id} auto-completed | withdraw £${payment.consultAmount}`,
      )
    } catch (error: any) {
      await session.abortTransaction()
      console.error(
        `❌ Session complete job failed for booking ${booking._id}:`,
        error.message,
      )
    } finally {
      session.endSession()
    }
  }

  console.log(
    `Session Complete Check Job done — ${completedCount} bookings auto-completed`,
  )
}
