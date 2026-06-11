// src/app/socket/handlers/booking/bookingComplete.handler.ts
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
import { BOOKING_STATUS } from '../../../modules/booking/booking.constants'
import { WITHDRAW_STATUS } from '../../../modules/withdraw/withdraw.constant'
import { sendNotification } from '../../../utils/sentNotification'
import { sendWithdrawNotify } from '../../../modules/withdraw/withdraw.utils'
import { modeType } from '../../../modules/notification/notification.interface'
import AppError from '../../../errors/AppError'

type TBookingCompletePayload = {
  bookingId: string
  callId: string
  duration: number
}

export const bookingComplete = eventHandler<TBookingCompletePayload>(
  async (socket: TSocket, data) => {
    if (!data?.bookingId) return

    const { bookingId, callId, duration } = data

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const booking = await Booking.findById(bookingId).session(session)
      if (!booking) throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')

      // 🔥 যদি আগেই Completed হয়ে থাকে তাহলে পুরোপুরি স্কিপ
      if (booking.status === BOOKING_STATUS.completed) {
        console.log(`⚠️ Booking ${bookingId} already completed. Skipping duplicate processing.`)
        await session.commitTransaction()
        return
      }

      // Mark as completed
      booking.status = BOOKING_STATUS.completed
      await booking.save({ session })

      // Check if Withdraw already exists
      let withdraw = await Withdraw.findOne({
        booking: booking._id.toString(),
        isDeleted: false,
      }).session(session)

      const isNewWithdraw = !withdraw

      // Create Withdraw only if it doesn't exist
      if (isNewWithdraw) {
        const payment = await Payment.findOne({
          booking: booking._id.toString(),
          isDeleted: false,
        }).session(session)

        if (!payment) throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')

        const contents = await Contents.findOne().lean()
        const holdDays = contents?.paymentHoldDays || 7
        const proceedAt = dayjs().add(holdDays, 'day').toDate()

        const [newWithdraw] = await Withdraw.create(
          [{
            user: booking.consult,
            booking: booking._id,
            amount: payment.consultAmount,
            status: WITHDRAW_STATUS.proceed,
            proceedAt,
          }] as any,
          { session }
        )

        withdraw = newWithdraw
        console.log(`✅ New Withdraw created for booking: ${bookingId}`)
      } else {
        console.log(`⚠️ Withdraw already existed for booking: ${bookingId}`)
      }

      await session.commitTransaction()

      // ================== NOTIFICATIONS ==================
      const [caller, receiver] = await Promise.all([
        User.findById(booking.user),
        User.findById(booking.consult),
      ])

      // General completion notification (every time is okay)
      const tokens: string[] = []
      if (caller?.fcmToken) tokens.push(caller.fcmToken)
      if (receiver?.fcmToken) tokens.push(receiver.fcmToken)

      if (tokens.length > 0) {
        await sendNotification(tokens, {
          receiver: caller?._id || receiver?._id,
          message: 'Session Completed',
          description: `Your call has ended. Duration: ${Math.floor(duration / 60)} min`,
          reference: callId,
          modelType: modeType.Calling,
        })
      }

      // 🔥 Withdraw Notification — শুধুমাত্র নতুন Withdraw তৈরি হলে পাঠাবে
      if (isNewWithdraw && receiver && withdraw) {
        console.log(`📤 Sending Withdraw Notification for new withdraw: ${withdraw._id}`)
        await sendWithdrawNotify(WITHDRAW_STATUS.proceed, withdraw, receiver)
      } else if (!isNewWithdraw) {
        console.log(`⏭️ Skipping withdraw notification (already sent previously)`)
      }

      // Emit to clients
      socket.emit('bookingComplete', {
        bookingId,
        callId,
        duration,
        status: BOOKING_STATUS.completed,
      })

      console.log(`✅ Booking completed processing finished | BookingId: ${bookingId}`)
    } catch (error: any) {
      await session.abortTransaction()
      console.error('❌ bookingComplete error:', error.message)
    } finally {
      session.endSession()
    }
  },
)