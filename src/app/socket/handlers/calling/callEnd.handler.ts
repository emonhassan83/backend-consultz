// src/app/socket/handlers/call/callEnd.handler.ts
import httpStatus from 'http-status'
import AppError from '../../../errors/AppError'
import { CALLING_STATUS } from '../../../modules/calling/calling.constant'
import { Calling } from '../../../modules/calling/calling.model'
import { modeType } from '../../../modules/notification/notification.interface'
import { User } from '../../../modules/user/user.model'
import { callbackFn } from '../../../utils/CallbackFn'
import { sendNotification } from '../../../utils/sentNotification'
import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'

type TCallEndPayload = {
  callId: string
  duration?: string
}

const terminalStatuses = [
  CALLING_STATUS.ended,
  CALLING_STATUS.completed,
  CALLING_STATUS.cancelled,
  CALLING_STATUS.missed,
  CALLING_STATUS.rejected,
]

const callEnd = eventHandler<TCallEndPayload>(
  async (socket: TSocket, data, callback) => {
    const userId = socket.auth._id.toString()
    const { callId, duration: clientDuration } = data || {}

    if (!callId) {
      return callbackFn(callback, {
        success: false,
        message: 'callId is required',
      })
    }

    try {
      const now = new Date()

      const call = await Calling.findOneAndUpdate(
        {
          _id: callId,
          $or: [{ caller: userId }, { receiver: userId }],
          status: { $nin: terminalStatuses },
          isDeleted: false,
        },
        {
          $set: {
            status: CALLING_STATUS.ended,
            endedAt: now,
            duration: clientDuration,
          },
        },
        { new: true },
      )

      if (!call) {
        const existingCall = await Calling.findOne({
          _id: callId,
          $or: [{ caller: userId }, { receiver: userId }],
          isDeleted: false,
        })

        if (!existingCall) {
          throw new AppError(
            httpStatus.NOT_FOUND,
            'Call session not found or unauthorized',
          )
        }

        if (terminalStatuses.includes(existingCall.status as any)) {
          return callbackFn(callback, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Call already ended',
            data: {
              callId: existingCall._id,
              duration: existingCall.duration || clientDuration,
              endedAt: existingCall.endedAt,
            },
          })
        }

        throw new AppError(httpStatus.BAD_REQUEST, 'Failed to end call')
      }

      const [caller, receiver] = await Promise.all([
        User.findById(call.caller),
        User.findById(call.receiver),
      ])

      const tokens: string[] = []
      if (caller?.fcmToken) tokens.push(caller.fcmToken)
      if (receiver?.fcmToken) tokens.push(receiver.fcmToken)

      if (tokens.length > 0) {
        await sendNotification(tokens, {
          receiver: caller?._id,
          message: 'Call Ended',
          description: `Your ${call.isVideo ? 'video' : 'voice'} call has ended. Duration: ${clientDuration}`,
          reference: call._id,
          modelType: modeType.Calling,
        }).catch((err: any) =>
          console.error(`Notification failed (call end): ${err.message}`),
        )
      }

      const participants = [call.caller.toString(), call.receiver.toString()]

      socket.to(participants).emit('callEnded', {
        callId: call._id,
        duration: clientDuration,
        endedAt: now,
        status: CALLING_STATUS.ended,
      })

      socket.emit('callEnded', {
        callId: call._id,
        duration: clientDuration,
        endedAt: now,
        status: CALLING_STATUS.ended,
      })

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call ended successfully',
        data: {
          callId: call._id,
          duration: clientDuration,
          endedAt: now,
        },
      })
    } catch (error: any) {
      console.error('Call end error:', error.message)

      callbackFn(callback, {
        success: false,
        message: error.message || 'Failed to end call',
      })
    }
  },
)

export default callEnd
