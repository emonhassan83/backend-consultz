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
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
} from '../../../modules/booking/booking.constants'
import {
  generateAgoraUidFromUserId,
  generateAgoraToken,
} from '../../../modules/calling/calling.utils'
import { CALLING_STATUS } from '../../../modules/calling/calling.constant'
import { sendDataMessageToToken } from '../../../utils/sentNotification'
import { sendVoIPPush } from '../../../utils/voipService'

type TCallStartPayload = {
  bookingId: string
  isVideo: boolean
}

const callStart = eventHandler<TCallStartPayload>(
  async (socket: TSocket, payload, callback) => {
    const callerId = socket.auth._id.toString()

    const { bookingId, isVideo = false } = payload ?? {}

    if (!bookingId) {
      return callbackFn(callback, {
        success: false,
        message: 'bookingId is required',
      })
    }

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const caller = await User.findById(callerId)
      if (!caller || caller.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Caller not found')
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        status: { $in: [BOOKING_STATUS.confirmed, BOOKING_STATUS.running] },
        paymentStatus: PAYMENT_STATUS.paid,
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
        const callerUid =
          activeCall.participants?.find(
            (participant: any) =>
              participant.user?.toString() === caller._id.toString(),
          )?.agoraUid || generateAgoraUidFromUserId(caller._id.toString())

        const callerTokenData = generateAgoraToken({
          channelName: activeCall.channelName,
          uid: callerUid,
        })

        await session.commitTransaction()

        return callbackFn(callback, {
          success: true,
          message: 'Active call already exists for this booking',
          data: {
            callId: activeCall._id,
            channelName: activeCall.channelName,
            token: callerTokenData.token,
            uid: callerUid,
            expireAt: callerTokenData.expireAt,
            isVideo: activeCall.isVideo,
            bookingId: booking._id.toString(),
            expertId: booking.consult.toString(),
            userId: booking.user.toString(),
          },
        })
      }

      const channelName = `booking_${booking._id}`

      const callerUid = generateAgoraUidFromUserId(caller._id.toString())
      const receiverUid = generateAgoraUidFromUserId(receiver._id.toString())

      const callerTokenData = generateAgoraToken({
        channelName,
        uid: callerUid,
      })
      const receiverTokenData = generateAgoraToken({
        channelName,
        uid: receiverUid,
      })

      const [calling] = await Calling.create(
        [
          {
            caller: caller._id.toString(),
            receiver: receiver._id.toString(),
            booking: booking._id.toString(),
            channelName,
            callId: callerUid,
            isVideo,
            token: callerTokenData.token,
            tokenExpireAt: callerTokenData.expireAt,
            status: CALLING_STATUS.pending,
            participants: [
              {
                user: caller._id.toString(),
                role: 'caller',
                status: CALLING_STATUS.pending,
                agoraUid: callerUid,
                joinedAt: new Date(),
              },
              {
                user: receiver._id.toString(),
                role: 'receiver',
                status: CALLING_STATUS.pending,
                agoraUid: receiverUid,
                joinedAt: null,
              },
            ],
          },
        ] as any,
        { session },
      )

      // Mark booking as running on first call start only
      if (booking.status === BOOKING_STATUS.confirmed) {
        await Booking.findByIdAndUpdate(
          bookingId,
          { status: BOOKING_STATUS.running, sessionStartedAt: new Date() },
          { session },
        )
      }

      await session.commitTransaction()

      callbackFn(callback, {
        success: true,
        message: 'Call started successfully',
        data: {
          callId: calling._id,
          channelName,
          token: callerTokenData.token,
          uid: callerUid,
          expireAt: callerTokenData.expireAt,
          isVideo,

          // for rating: bookingId, expertID, userID
          bookingId: booking._id.toString(),
          expertId: booking.consult.toString(),
          userId: booking.user.toString(),
        },
      })

      // ================== PUSH NOTIFICATION LOGIC ==================
      // Same keys for iOS VoIP + Android FCM (uid === agora_uid, token === agora_token)
      const callIncomingPayload = {
        type: 'incoming_call',
        call_id: calling._id.toString(),
        callId: calling._id.toString(),
        callerId: caller._id.toString(),
        caller_name: `${caller.firstName || ''} ${caller.lastName || ''}`.trim(),
        callerName: `${caller.firstName || ''} ${caller.lastName || ''}`.trim(),
        caller_photo: caller.photoUrl || '',
        callerPhoto: caller.photoUrl || '',
        is_video: isVideo,
        isVideo,
        channel_name: channelName,
        channelName,
        agora_token: receiverTokenData.token,
        agora_uid: receiverUid,
        token: receiverTokenData.token,
        uid: receiverUid,
        expireAt: receiverTokenData.expireAt,
        bookingId: booking._id.toString(),
        expertId: booking.consult.toString(),
        userId: booking.user.toString(),
      }

      if (receiver.deviceType === 'ios' && receiver.voipToken) {
        // iOS → VoIP Push
        const voipResult = await sendVoIPPush(receiver.voipToken, {
          call_id: callIncomingPayload.call_id,
          caller_name: callIncomingPayload.caller_name,
          caller_photo: callIncomingPayload.caller_photo,
          channel_name: callIncomingPayload.channel_name,
          agora_token: callIncomingPayload.agora_token,
          agora_uid: callIncomingPayload.agora_uid,
          is_video: callIncomingPayload.is_video,
          bookingId: callIncomingPayload.bookingId,
          expertId: callIncomingPayload.expertId,
          userId: callIncomingPayload.userId,
        })

        if (!voipResult.success && voipResult.reason === 'BadDeviceToken') {
          await User.updateOne(
            { _id: receiver._id, voipToken: receiver.voipToken },
            { $set: { voipToken: null } },
          )
        }
      } else if (receiver.fcmToken) {
        // Android or fallback → FCM (same keys as iOS VoIP)
        await sendDataMessageToToken(receiver.fcmToken, {
          ...callIncomingPayload,
        })
      }
    } catch (error: any) {
      if (session.inTransaction()) {
        await session.abortTransaction()
      }
      console.error('callStart error:', error.message)
      callbackFn(callback, { success: false, message: error.message })
    } finally {
      session.endSession()
    }
  },
)

export default callStart
