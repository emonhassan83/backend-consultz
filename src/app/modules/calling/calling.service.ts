import { Calling } from './calling.model'
import { User } from '../user/user.model'
import { generateAgoraToken } from './calling.utils'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import mongoose from 'mongoose'
import { Booking } from '../booking/booking.models'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'
import { BOOKING_STATUS } from '../booking/booking.constants'
import { CALLING_STATUS } from './calling.constant'
import { ICalling } from './calling.interface'
import { Withdraw } from '../withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'
import { sendWithdrawNotify } from '../withdraw/withdraw.utils'
import { Payment } from '../payment/payment.model'
import { Contents } from '../contents/contents.models'
import dayjs from 'dayjs'

const startCalling = async (userId: string, payload: ICalling) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // validate user
    const user = await User.findById(userId)
    if (!user || user?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found')
    }

    // Find Booking and authorization checked
    const booking = await Booking.findOne({
      _id: payload.bookingId,
      consult: user._id,
      status: BOOKING_STATUS.confirmed,
      isDeleted: false,
    }).session(session)
    if (!booking) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Valid confirmed booking not found',
      )
    }

    // Receiver (client) find out
    const receiver = await User.findById(booking.user).session(session)
    if (!receiver || receiver.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found')
    }

    // Unique channel name (booking ID + timestamp)
    const channelName = `booking_${booking._id}_${Date.now()}`

    // Agora token generate
    const tokenData = generateAgoraToken({
      channelName,
      uid: Number(Date.now()), // unique UID
    })

    // Calling record create
    const calling = await Calling.create(
      [
        {
          caller: user._id,
          receiver: receiver._id,
          booking: booking._id,
          channelName,
          callId: tokenData.uid,
          isVideo: payload.isVideo,
          token: tokenData.token,
          tokenExpireAt: tokenData.expireAt,
          status: CALLING_STATUS.PENDING,
        },
      ],
      { session },
    )

    // Send  Receiver
    if (receiver.fcmToken) {
      const notificationPayload = {
        message: payload.isVideo
          ? 'Incoming Video Call'
          : 'Incoming Voice Call',
        description: `${user.firstName} is calling you`,
        reference: calling[0]._id,
        model_type: modeType.Calling,
      }

      await sendNotification([receiver.fcmToken], notificationPayload)
    }

    await session.commitTransaction()

    return {
      callId: calling[0]._id,
      channelName,
      token: tokenData.token,
      expireAt: tokenData.expireAt,
      isVideo: payload.isVideo,
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const endCalling = async (payload: { callId: string }, userId: string) => {
  const { callId } = payload

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Find calling and validate
    const calling = await Calling.findOne({
      _id: callId,
      $or: [{ caller: userId }, { receiver: userId }],
      isDeleted: false,
    }).session(session)

    if (!calling) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Call session not found or unauthorized',
      )
    }

    // If call already ended
    if (calling.status === CALLING_STATUS.COMPLETED) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Call already ended')
    }

    // Call end
    const now = new Date()
    const startTime = calling.createdAt
    const durationSeconds = Math.floor(
      (now.getTime() - startTime.getTime()) / 1000,
    )

    calling.status = CALLING_STATUS.COMPLETED
    calling.endedAt = now
    calling.duration = durationSeconds
    await calling.save({ session })

    // Find and update booking
    const booking = await Booking.findById(calling.booking).session(session)
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Related booking not found')
    }

    booking.status = BOOKING_STATUS.completed
    await booking.save({ session })

    // Find the payment record
    const payment = await Payment.findOne({
      booking: booking._id,
      isDeleted: false,
    }).session(session)
    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Related payment not found')
    }

    const contents = await Contents.findOne({ isDeleted: false }).lean()
    const holdDays = contents?.paymentHoldDays || 7

    // Calculate future proceedAt date (now + holdDays)
    const proceedAtDate = dayjs(now).add(holdDays, 'day').toDate();

    // Atomic Withdraw request creation with future proceedAt
    const [withdraw] = await Withdraw.create(
      [
        {
          user: booking.consult,
          booking: booking._id,
          amount: payment.consultAmount,
          status: WITHDRAW_STATUS.proceed,
          proceedAt: proceedAtDate, // ← This is the key change: now + holdDays
        },
      ],
      { session },
    );

    // Both particles send notification
    const [caller, receiver] = await Promise.all([
      User.findById(calling.caller).session(session),
      User.findById(calling.receiver).session(session),
    ])

    const notificationPayload = {
      message: 'Call Ended',
      description: `Your ${calling.isVideo ? 'video' : 'voice'} call has ended. Duration: ${Math.floor(durationSeconds / 60)} min ${durationSeconds % 60} sec`,
      reference: calling._id,
      model_type: modeType.Calling,
    }

    const tokens: string[] = []
    if (caller?.fcmToken) tokens.push(caller.fcmToken)
    if (receiver?.fcmToken) tokens.push(receiver.fcmToken)

    if (tokens.length > 0) {
      await sendNotification(tokens, notificationPayload)
    }

    // sent notify to consult
    if (caller?._id.toString() === booking.consult.toString()) {
      await sendWithdrawNotify(WITHDRAW_STATUS.proceed, withdraw, caller)
    }

    await session.commitTransaction()

    return calling
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

export const CallingService = {
  startCalling,
  endCalling,
}
