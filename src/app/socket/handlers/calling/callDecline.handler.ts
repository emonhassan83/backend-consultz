// src/app/socket/handlers/call/callDecline.handler.ts
import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'
import { Calling } from '../../../modules/calling/calling.model'
import { callbackFn } from '../../../utils/CallbackFn'
import { emitToParticipants } from '../../utils/emitToParticipants'
import { CALLING_STATUS } from '../../../modules/calling/calling.constant'
import httpStatus from 'http-status'
import { User } from '../../../modules/user/user.model'
import { sendNotification } from '../../../utils/sentNotification'
import { modeType } from '../../../modules/notification/notification.interface'

type TCallDeclinePayload = {
  callId: string
}

export const callDecline = eventHandler<TCallDeclinePayload>(
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
      if (!call) {
        return callbackFn(callback, {
          success: false,
          message: 'Call not found.',
        })
      }

      // ─── Update participant + call status ─────────────────────────────
      const participant = call.participants.find(
        (p) => p.user!.toString() === authId,
      )
      if (participant) {
        participant.status = CALLING_STATUS.rejected
        participant.leftAt = new Date()
      }
      call.status = CALLING_STATUS.rejected
      await call.save()

      const allParticipantIds = call.participants.map((p) => p.user!.toString())

      // ─── Socket emit to all participants ──────────────────────────────
      emitToParticipants(allParticipantIds, 'callDeclined', {
        callId: call._id,
        declinedBy: authId,
      })

      // ─── Push notification to the OTHER participant (caller) ──────────
      const otherUserId = allParticipantIds.find((id) => id !== authId)
      if (otherUserId) {
        const otherUser =
          await User.findById(otherUserId).select('fcmToken _id')
        if (otherUser?.fcmToken) {
          await sendNotification([otherUser.fcmToken], {
            receiver: otherUser._id,
            message: 'Call Declined',
            description: `Your ${call.isVideo ? 'video' : 'voice'} call was declined.`,
            reference: call._id,
            modelType: modeType.Calling,
          }).catch((err: any) =>
            console.error(`❌ Notification failed (decline): ${err.message}`),
          )
        }
      }

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call declined.',
      })
    } catch (err: any) {
      console.error('callDecline error:', err.message)
      callbackFn(callback, { success: false, message: err.message })
    }
  },
)
