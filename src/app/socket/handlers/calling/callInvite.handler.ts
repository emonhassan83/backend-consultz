// src/app/socket/handlers/call/callInvite.handler.ts
import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'
import { Calling } from '../../../modules/calling/calling.model'
import { User } from '../../../modules/user/user.model'
import { callbackFn } from '../../../utils/CallbackFn'
import { emitToParticipants } from '../../utils/emitToParticipants'
import httpStatus from 'http-status'
import { sendVoIPPush } from '../../../utils/voipService'
import { sendDataMessageToToken } from '../../../utils/sentNotification'
import { Booking } from '../../../modules/booking/booking.models'
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
} from '../../../modules/booking/booking.constants'
import AppError from '../../../errors/AppError'
import {
  generateAgoraToken,
  generateAgoraUidFromUserId,
} from '../../../modules/calling/calling.utils'

type TCallInvitePayload = {
  callId: string
}

export const callInvite = eventHandler<TCallInvitePayload>(
  async (socket: TSocket, data, callback) => {
    const authId = socket.auth._id.toString()

    if (!data?.callId) {
      return callbackFn(callback, {
        success: false,
        message: 'callId is required',
      })
    }

    try {
      const call = await Calling.findById(data.callId)
        .populate('participants.user')
        .populate('caller')

      if (!call) {
        return callbackFn(callback, {
          success: false,
          message: 'Call not found.',
        })
      }

      const booking = await Booking.findOne({
        _id: call.booking.toString(),
        status: { $in: [BOOKING_STATUS.confirmed, BOOKING_STATUS.running] },
        paymentStatus: PAYMENT_STATUS.paid,
        isDeleted: false,
      })

      if (!booking) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Valid confirmed booking not found',
        )
      }

      const caller = call.caller as any
      const participants = call.participants

      // Emit to all participants via socket (foreground)
      emitToParticipants(
        participants.map((p) => p.user!._id.toString()),
        'callIncoming',
        {
          callId: call.id,
          callerId: caller._id,
          callerName:
            `${caller.firstName || ''} ${caller.lastName || ''}`.trim(),
          callerPhoto: caller.photoUrl || '',
          isVideo: call.isVideo,
          channelName: call.channelName,
          status: call.status,
        },
      )

      // ================== PUSH NOTIFICATION FOR BACKGROUND/KILLED APP ==================
      for (const participant of participants) {
        const user = participant.user as any
        if (!user) continue

        const callPayload = {
          callId: call._id.toString(),
          callerId: caller._id.toString(),
          callerName:
            `${caller.firstName || ''} ${caller.lastName || ''}`.trim(),
          callerPhoto: caller.photoUrl || '',
          isVideo: call.isVideo,
          channelName: call.channelName,

          bookingId: booking._id.toString(),
          expertId: booking.consult.toString(),
          userId: booking.user.toString(),
        }

        if (user.deviceType === 'ios' && user.voipToken) {
          const agoraUid =
            participant.agoraUid || generateAgoraUidFromUserId(user._id.toString())
          const tokenData = generateAgoraToken({
            channelName: call.channelName,
            uid: agoraUid,
          })
          // iOS → VoIP Push
          await sendVoIPPush(user.voipToken, {
            call_id: call._id.toString(),
            caller_name: callPayload.callerName,
            caller_photo: callPayload.callerPhoto,
            channel_name: call.channelName,
            agora_token: tokenData.token,
            agora_uid: agoraUid,
            is_video: call.isVideo,

            // for rating: bookingId, expertID, userID
            bookingId: booking._id.toString(),
            expertId: booking.consult.toString(),
            userId: booking.user.toString(),
          })
        } else if (user.fcmToken) {
          // Android / Fallback → FCM
          await sendDataMessageToToken(user.fcmToken, {
            type: 'incoming_call',
            ...callPayload,
          })
        }
      }

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call invitation sent successfully.',
      })
    } catch (err: any) {
      console.error('callInvite error:', err.message)
      callbackFn(callback, {
        success: false,
        message: err.message || 'Failed to send call invite',
      })
    }
  },
)

export default callInvite
