import mongoose from 'mongoose'
import httpStatus from 'http-status'
import dayjs from 'dayjs'
import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'
import { Booking } from '../../../modules/booking/booking.models'
import { Payment } from '../../../modules/payment/payment.model'
import { Withdraw } from '../../../modules/withdraw/withdraw.model'
import { User } from '../../../modules/user/user.model'
import { Contents } from '../../../modules/contents/contents.models'
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
} from '../../../modules/booking/booking.constants'
import { WITHDRAW_STATUS } from '../../../modules/withdraw/withdraw.constant'
import { sendNotification } from '../../../utils/sentNotification'
import { sendWithdrawNotify } from '../../../modules/withdraw/withdraw.utils'
import { modeType } from '../../../modules/notification/notification.interface'
import AppError from '../../../errors/AppError'

type TBookingCompletePayload = {
  bookingId: string
  callId: string
  duration: string
}

export const bookingComplete = eventHandler<TBookingCompletePayload>(
  async (socket: TSocket, data) => {
    // No callback needed — this is triggered internally by callEnd
    if (!data?.bookingId) return

    const { bookingId, callId, duration } = data
    const userId = socket.auth._id.toString()

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      // 1. Complete Booking
      const booking = await Booking.findOne({
        _id: bookingId,
        paymentStatus: PAYMENT_STATUS.paid,
        isDeleted: false,
        $or: [{ user: userId }, { consult: userId }],
        status: {
          $in: [
            BOOKING_STATUS.running,
            BOOKING_STATUS.confirmed,
            BOOKING_STATUS.completed,
          ],
        },
      }).session(session)
      if (!booking)
        throw new AppError(httpStatus.NOT_FOUND, 'Paid active booking not found')

      if (booking.status !== BOOKING_STATUS.completed) {
        booking.status = BOOKING_STATUS.completed
        await booking.save({ session })
      }

      // 2. Find Payment
      const payment = await Payment.findOne({
        booking: booking._id.toString(),
        isPaid: true,
        isDeleted: false,
      }).session(session)

      if (!payment)
        throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')

      // 3. Create Withdraw (idempotent — skip if already created by cron job)
      const existingWithdraw = await Withdraw.findOne({
        booking: booking._id.toString(),
      }).session(session)

      const paymentHoldDaysContent = await Contents.findOne({ key: 'paymentHoldDays' }).lean()
      const holdDays = paymentHoldDaysContent?.value || 7
      const proceedAt = dayjs().add(holdDays, 'day').toDate()

      const withdraw = existingWithdraw ?? (
        await Withdraw.create(
          [
            {
              user: booking.consult,
              booking: booking._id.toString(),
              amount: payment.consultAmount,
              status: WITHDRAW_STATUS.proceed,
              proceedAt,
            },
          ],
          { session },
        )
      )[0]

      await session.commitTransaction()

      // 4. FCM Notifications to both users
      const [caller, receiver] = await Promise.all([
        User.findById(booking.user),
        User.findById(booking.consult),
      ])

      const tokens: string[] = []
      if (caller?.fcmToken) tokens.push(caller.fcmToken)
      if (receiver?.fcmToken) tokens.push(receiver.fcmToken)


      if (tokens.length > 0) {
        await sendNotification(tokens, {
          receiver: caller?._id,
          message: 'Session completed',
          description: `Your call has ended. Duration: ${duration}`,
          reference: callId,
          modelType: modeType.Calling,
        })
      }

      // 5. Withdraw notification to consultant
      await sendWithdrawNotify(WITHDRAW_STATUS.proceed, withdraw, receiver!)

      // 6. Emit bookingCompleted back to client
      socket.emit('bookingComplete', {
        bookingId,
        callId,
        duration: duration,
        status: BOOKING_STATUS.completed,
      })

      console.log(`✅ Booking completed | BookingId: ${bookingId}`)
    } catch (error: any) {
      await session.abortTransaction()
      console.error('❌ bookingComplete error:', error.message)
    } finally {
      session.endSession()
    }
  },
)
