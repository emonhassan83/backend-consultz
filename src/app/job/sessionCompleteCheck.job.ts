import dayjs from 'dayjs'
import mongoose from 'mongoose'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { Booking } from '../modules/booking/booking.models'
import { getGeneralSettingNumber } from '../modules/contents/contents.utils'
import { PAYMENT_SETTLEMENT_STATUS } from '../modules/payment/payment.constant'
import { TPayment } from '../modules/payment/payment.interface'
import { Payment } from '../modules/payment/payment.model'
import { User } from '../modules/user/user.model'
import { sendSessionCompletedToConsultant } from '../utils/emailNotify'

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

  const holdDays = await getGeneralSettingNumber('paymentHoldDays', 7)
  let completedCount = 0

  for (const booking of runningBookings) {
    const sessionEnd = dayjs(booking.sessionStartedAt).add(
      booking.sessionDuration,
      'minute',
    )

    if (now.isBefore(sessionEnd)) continue

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const liveBooking = await Booking.findOne({
        _id: booking._id,
        status: BOOKING_STATUS.running,
        paymentStatus: PAYMENT_STATUS.paid,
      }).session(session)

      if (!liveBooking) {
        await session.abortTransaction()
        continue
      }

      const payment: TPayment | null = await Payment.findOne({
        booking: booking._id.toString(),
        isPaid: true,
        isDeleted: false,
      }).session(session)

      if (!payment) {
        await session.abortTransaction()
        console.warn(`Booking ${booking._id}: no paid payment found - skipping`)
        continue
      }

      const holdUntil = sessionEnd.add(holdDays, 'day').toDate()

      await Booking.findByIdAndUpdate(
        booking._id,
        { status: BOOKING_STATUS.completed },
        { session },
      )

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

      await session.commitTransaction()
      completedCount++

      const [consultant, booker] = await Promise.all([
        User.findById(booking.consult).select(
          '_id firstName lastName email fcmToken pushNotify emailNotify',
        ),
        User.findById(booking.user).select('_id firstName lastName email'),
      ])

      if (consultant?.emailNotify?.payment && booker) {
        await sendSessionCompletedToConsultant(
          consultant as any,
          booking as any,
          booker as any,
          {
            ...payment,
            settlementStatus: PAYMENT_SETTLEMENT_STATUS.held,
            holdUntil,
            holdDaysSnapshot: holdDays,
          },
          holdDays,
        ).catch((err) =>
          console.error(`Email failed (booking ${booking._id}):`, err),
        )
      }

      console.log(
        `Booking ${booking._id} auto-completed | payment held until ${holdUntil.toISOString()}`,
      )
    } catch (error: any) {
      await session.abortTransaction()
      console.error(
        `Session complete job failed for booking ${booking._id}:`,
        error.message,
      )
    } finally {
      session.endSession()
    }
  }

  console.log(
    `Session Complete Check Job done - ${completedCount} bookings auto-completed`,
  )
}
