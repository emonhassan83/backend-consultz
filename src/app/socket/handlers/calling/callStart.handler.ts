// src/app/socket/handlers/call/callStart.handler.ts
import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'
import { Calling } from '../../../modules/calling/calling.model'
import { User } from '../../../modules/user/user.model'
import { callbackFn } from '../../../utils/CallbackFn'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import AppError from '../../../errors/AppError'
import { Booking } from '../../../modules/booking/booking.models'
import { BOOKING_STATUS } from '../../../modules/booking/booking.constants'
import { generateAgoraToken } from '../../../modules/calling/calling.utils'
import { CALLING_STATUS } from '../../../modules/calling/calling.constant'
import onlineUsers from '../../utils/onlineUsers'

type TCallStartPayload = {
  bookingId: string
  isVideo: boolean
}

const callStart = eventHandler<TCallStartPayload>(
  async (socket: TSocket, payload, callback) => {
    const callerId = socket.auth._id.toString()

    console.log('🔥 callStart handler started')
    console.log('Payload received:', payload)
    console.log('Callback type received:', typeof callback)

    if (!payload?.bookingId) {
      console.log('❌ Missing bookingId')
      return callbackFn(callback, {
        success: false,
        message: 'bookingId is required',
      })
    }

    if (!payload?.bookingId) {
      console.log('❌ Missing bookingId')
      return callbackFn(callback, {
        success: false,
        message: 'bookingId is required',
      })
    }

    const { bookingId, isVideo = false } = payload

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const caller = await User.findById(callerId)
      if (!caller || caller.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Caller not found')
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        status: BOOKING_STATUS.confirmed,
        isDeleted: false,
        $or: [{ user: callerId }, { consult: callerId }],
      }).session(session)

      if (!booking) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Valid confirmed booking not found',
        )
      }

      const receiverId =
        booking.user.toString() === callerId ? booking.consult : booking.user

      const receiver = await User.findById(receiverId).session(session)
      if (!receiver || receiver.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found')
      }

      const channelName = `booking_${booking._id}_${Date.now()}`
      const uid = Number(Date.now())
      const tokenData = generateAgoraToken({ channelName, uid })

      const [calling] = await Calling.create(
        [
          {
            caller: caller._id,
            receiver: receiver._id,
            booking: booking._id,
            channelName,
            callId: uid,
            isVideo,
            token: tokenData.token,
            tokenExpireAt: tokenData.expireAt,
            status: CALLING_STATUS.pending,
            participants: [
              {
                user: caller._id,
                role: 'caller',
                status: CALLING_STATUS.pending,
                agoraUid: uid,
                joinedAt: new Date(),
              },
              {
                user: receiver._id,
                role: 'receiver',
                status: CALLING_STATUS.pending,
                agoraUid: null,
                joinedAt: null,
              },
            ],
          },
        ],
        { session },
      )

      await session.commitTransaction()

      const responseData = {
        callId: calling._id,
        channelName,
        token: tokenData.token,
        uid,
        expireAt: tokenData.expireAt,
        isVideo,
      }

      console.log(`✅ Call created successfully | CallId: ${calling._id}`)

      // ✅ খুব গুরুত্বপূর্ণ: callbackFn সঠিকভাবে কল করো
      if (typeof callback === 'function') {
        callbackFn(callback, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Call started successfully',
          data: responseData,
        })
      } else {
        // যদি callback না থাকে, তাহলে direct emit করো
        socket.emit('call-start-response', {
          success: true,
          message: 'Call started successfully',
          data: responseData,
        })
      }
      console.log({ receiver })

      // Receiver কে notify
      const receiverRoom = receiver._id.toString()
      console.log(`📨 Attempting to send callIncoming to room: ${receiverRoom}`)

      const receiverSocket = onlineUsers[receiverRoom]

      if (receiverSocket) {
        receiverSocket.emit('callIncoming', {
          callId: calling._id,
          callerId: caller._id,
          callerName:
            `${caller.firstName || ''} ${caller.lastName || ''}`.trim(),
          isVideo,
          channelName,
        })
        console.log(`✅ callIncoming event sent to receiver ${receiverRoom}`)
      } else {
        console.log(`⚠️ Receiver ${receiverRoom} is not online right now`)
        // এখানে FCM push notification পাঠাতে পারো (optional)
      }
    } catch (error: any) {
      await session.abortTransaction()
      console.error('❌ Call start error:', error.message)

      callbackFn(callback, {
        success: false,
        message: error.message || 'Failed to start call',
      })
    } finally {
      session.endSession()
    }
  },
)

export default callStart
