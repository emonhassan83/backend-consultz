// src/app/socket/handlers/call/callCancel.handler.ts
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

type TCallCancelPayload = {
  callId: string
}

export const callCancel = eventHandler<TCallCancelPayload>(
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

      if (call.caller.toString() !== authId) {
        return callbackFn(callback, {
          success: false,
          message: 'Only the caller can cancel this call.',
        })
      }

      call.status = CALLING_STATUS.cancelled
      await call.save()

      const allParticipantIds = call.participants.map((p) => p.user!.toString())

      // ─── Socket emit to all participants ──────────────────────────────
      emitToParticipants(allParticipantIds, 'callCanceled', {
        callId: call._id,
        canceledBy: authId,
      })

      // ─── Push notification to receiver ────────────────────────────────
      const receiver = await User.findById(call.receiver).select('fcmToken _id')
      if (receiver?.fcmToken) {
        await sendNotification([receiver.fcmToken], {
          receiver: receiver._id,
          message: 'Missed Call',
          description: `You missed a ${call.isVideo ? 'video' : 'voice'} call.`,
          reference: call._id,
          modelType: modeType.Calling,
        }).catch((err: any) =>
          console.error(`❌ Notification failed (cancel): ${err.message}`),
        )
      }

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call canceled.',
      })
    } catch (err: any) {
      console.error('callCancel error:', err.message)
      callbackFn(callback, { success: false, message: err.message })
    }
  },
)
