import { Calling } from './calling.model'
import { User } from '../user/user.model'
import { generateAgoraUidFromUserId, generateAgoraToken } from './calling.utils'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import mongoose from 'mongoose'
import { Booking } from '../booking/booking.models'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../booking/booking.constants'
import { CALLING_STATUS } from './calling.constant'
import { ICalling } from './calling.interface'
import { Withdraw } from '../withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'
import { sendWithdrawNotify } from '../withdraw/withdraw.utils'
import { Payment } from '../payment/payment.model'
import { Contents } from '../contents/contents.models'
import dayjs from 'dayjs'

/* =========================================================
   🚀 START CALL
========================================================= */
const startCalling = async (userId: string, payload: ICalling) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    /* 1. Validate caller */
    const caller = await User.findById(userId)
    if (!caller || caller.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Caller not found')
    }

    /* 2. Validate booking */
    const booking = await Booking.findOne({
      _id: payload.bookingId,
      status: BOOKING_STATUS.confirmed,
      paymentStatus: PAYMENT_STATUS.paid,
      isDeleted: false,
      $or: [{ user: userId }, { consult: userId }],
    }).session(session)

    if (!booking) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Valid confirmed booking not found',
      )
    }

    /* 3. Get receiver */
    const receiverId =
      booking.user.toString() === userId ? booking.consult : booking.user

    const receiver = await User.findById(receiverId).session(session)
    if (!receiver || receiver.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found')
    }

    const activeCall = await Calling.findOne({
      booking: booking._id as any,
      status: {
        $in: [
          CALLING_STATUS.pending,
          CALLING_STATUS.ringing,
          CALLING_STATUS.accepted,
        ],
      },
      isDeleted: false,
    }).session(session)

    if (activeCall) {
      const existingUid = generateAgoraUidFromUserId(userId)
      const existingTokenData = generateAgoraToken({
        channelName: activeCall.channelName,
        uid: existingUid,
      })

      await session.commitTransaction()

      return {
        callId: activeCall._id,
        channelName: activeCall.channelName,
        token: existingTokenData.token,
        uid: existingUid,
        expireAt: existingTokenData.expireAt,
        isVideo: activeCall.isVideo,
      }
    }

    /* 4. Create stable channel */
    const channelName = `booking_${booking._id}`

    /* 5. Generate token */
    const callerUid = generateAgoraUidFromUserId(caller._id.toString())
    const receiverUid = generateAgoraUidFromUserId(receiver._id.toString())
    const tokenData = generateAgoraToken({
      channelName,
      uid: callerUid,
    })

    /* 6. Save calling */
    const [calling] = await Calling.create(
      [
        {
          caller: caller._id,
          receiver: receiver._id,
          booking: booking._id,
          channelName,
          callId: callerUid,
          isVideo: payload.isVideo,
          token: tokenData.token,
          tokenExpireAt: tokenData.expireAt,
          status: CALLING_STATUS.pending,
          participants: [
            {
              user: caller._id,
              role: 'caller',
              status: CALLING_STATUS.pending,
              agoraUid: callerUid,
              joinedAt: new Date(),
            },
            {
              user: receiver._id,
              role: 'receiver',
              status: CALLING_STATUS.pending,
              agoraUid: receiverUid,
              joinedAt: null,
            },
          ],
        },
      ] as any[],
      { session },
    )

    /* 7. Send notification */
    if (receiver.fcmToken) {
      await sendNotification([receiver.fcmToken], {
        receiver: receiver._id,
        message: payload.isVideo
          ? 'Incoming Video Call'
          : 'Incoming Voice Call',
        description: `${caller.firstName} is calling you`,
        reference: calling._id,
        modelType: modeType.Calling,
      })
    }

    await session.commitTransaction()

    return {
      callId: calling._id,
      channelName,
      token: tokenData.token,
      uid: callerUid,
      expireAt: tokenData.expireAt,
      isVideo: payload.isVideo,
    }
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction()
    }
    throw error
  } finally {
    session.endSession()
  }
}

/* =========================================================
   📡 GENERATE TOKEN (Rejoin নিরাপদ)
========================================================= */
const generateCallToken = async (
  userId: string,
  payload: { callId: string },
) => {
  const { callId } = payload

  const call = await Calling.findById(callId)

  if (!call || call.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Call not found')
  }

  if (
    call.caller.toString() !== userId &&
    call.receiver.toString() !== userId
  ) {
    throw new AppError(httpStatus.FORBIDDEN, 'Unauthorized')
  }

  const uid = generateAgoraUidFromUserId(userId)

  const tokenData = generateAgoraToken({
    channelName: call.channelName,
    uid,
  })

  return {
    token: tokenData.token,
    uid,
    expireAt: tokenData.expireAt,
  }
}

/* =========================================================
   🛑 END CALL (CRITICAL BUSINESS LOGIC)
========================================================= */
const endCalling = async (payload: { callId: string }, userId: string) => {
  const { callId } = payload

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const call = await Calling.findOne({
      _id: callId,
      $or: [{ caller: userId }, { receiver: userId }],
      isDeleted: false,
    }).session(session)

    if (!call) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Call session not found or unauthorized',
      )
    }

    if (call.status === CALLING_STATUS.completed) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Call already ended')
    }

    /* duration calculate */
    const now = new Date()
    const startTime = call.startedAt || call.createdAt
    const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000)

    call.status = CALLING_STATUS.completed
    call.endedAt = now
    call.duration = duration as any
    await call.save({ session })

    /* booking complete */
    const booking = (await Booking.findOne({
      _id: call.booking,
      paymentStatus: PAYMENT_STATUS.paid,
      isDeleted: false,
      $or: [{ user: userId }, { consult: userId }],
      status: { $in: [BOOKING_STATUS.running, BOOKING_STATUS.confirmed] },
    } as any).session(session)) as any
    if (!booking) throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')

    booking.status = BOOKING_STATUS.completed
    await booking.save({ session })

    /* payment */
    const payment = await Payment.findOne({
      booking: booking._id.toString(),
      isDeleted: false,
    }).session(session)
    if (!payment) throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')

    /* withdraw create */
    const paymentHoldDaysContent = await Contents.findOne({ key: 'paymentHoldDays' }).lean()
    const holdDays = paymentHoldDaysContent?.value || 7

    const proceedAt = dayjs(now).add(holdDays, 'day').toDate()

    const existingWithdraw = await Withdraw.findOne({
      booking: booking._id.toString(),
    }).session(session)

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

    /* notification */
    const [caller, receiver] = await Promise.all([
      User.findById(call.caller),
      User.findById(call.receiver),
    ])

    const tokens: string[] = []
    if (caller?.fcmToken) tokens.push(caller.fcmToken)
    if (receiver?.fcmToken) tokens.push(receiver.fcmToken)

    if (tokens.length) {
      await sendNotification(tokens, {
        receiver: caller?._id,
        message: 'Call Ended',
        description: `Your ${call.isVideo ? 'video' : 'voice'} call has ended. Duration: ${Math.floor(duration / 60)} min`,
        reference: call._id,
        modelType: modeType.Calling,
      })
    }

    // sent notify to consult
    if (caller && caller._id.toString() === booking.consult.toString()) {
      await sendWithdrawNotify(WITHDRAW_STATUS.proceed, withdraw, caller)
    }

    await session.commitTransaction()

    return call
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

/* =========================================================
   📊 GET MY CALLS
========================================================= */
const getMyCalls = async (userId: string) => {
  const result = await Calling.find({
    $or: [{ caller: userId }, { receiver: userId }],
    isDeleted: false,
  })
    .populate('caller receiver booking')
    .sort({ createdAt: -1 })

  return result
}

export const CallingService = {
  startCalling,
  generateCallToken,
  endCalling,
  getMyCalls,
}
