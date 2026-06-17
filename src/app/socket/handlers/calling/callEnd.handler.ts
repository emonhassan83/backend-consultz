// src/app/socket/handlers/call/callEnd.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { User } from '../../../modules/user/user.model';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import AppError from '../../../errors/AppError';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';
import { sendNotification } from '../../../utils/sentNotification';
import { modeType } from '../../../modules/notification/notification.interface';
import { callbackFn } from '../../../utils/CallbackFn';
import { formatDuration } from '../../utils/formatDuration';

type TCallEndPayload = {
  callId: string;
  duration?: number; // IN min
};

const callEnd = eventHandler<TCallEndPayload>(
  async (socket: TSocket, data, callback) => {
    const userId = socket.auth._id.toString();
    const { callId, duration: clientDuration } = data || {};

    if (!callId) {
      return callbackFn(callback, { 
        success: false, 
        message: 'callId is required' 
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Find call with authorization
      const call = await Calling.findOne({
        _id: callId,
        $or: [{ caller: userId }, { receiver: userId }],
        isDeleted: false,
      }).session(session);

      if (!call) {
        throw new AppError(httpStatus.NOT_FOUND, 'Call session not found or unauthorized');
      }

      // 2. Calculate duration
      const now = new Date();
      const startTime = call.startedAt || call.createdAt;
      const finalDurationInMinutes = clientDuration ?? 
        Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // Format for display
      const formattedDuration = formatDuration(finalDurationInMinutes);

      // 3. Update call
      call.status = CALLING_STATUS.ended;
      call.endedAt = now;
      call.duration = finalDurationInMinutes;
      await call.save({ session });


      // 6. Notification to both users
      const [caller, receiver] = await Promise.all([
        User.findById(call.caller),
        User.findById(call.receiver),
      ]);

      const tokens: string[] = [];
      if (caller?.fcmToken) tokens.push(caller.fcmToken);
      if (receiver?.fcmToken) tokens.push(receiver.fcmToken);

      if (tokens.length > 0) {
        await sendNotification(tokens, {
          receiver: caller?._id,
          message: 'Call Ended',
          description: `Your ${call.isVideo ? 'video' : 'voice'} call has ended. Duration: ${formattedDuration}`,
          reference: call._id,
          modelType: modeType.Calling,
        });
      }

      await session.commitTransaction();

      // 8. Emit to all participants
      const participants = [call.caller.toString(), call.receiver.toString()];

      socket.to(participants).emit('callEnded', {
        callId: call._id,
        duration: formattedDuration,
        endedAt: now,
        status: CALLING_STATUS.completed,
      });

      // Caller নিজেও পায়
      socket.emit('callEnded', {
        callId: call._id,
        duration: formattedDuration,
        endedAt: now,
        status: CALLING_STATUS.completed,
      });

      // ✅ callbackFn দিয়ে response দাও (chat এর মতো)
      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call ended successfully',
        data: {
          callId: call._id,
          duration: formattedDuration,
          endedAt: now,
        }
      });

    } catch (error: any) {
      await session.abortTransaction();
      console.error('❌ Call end error:', error.message);

      callbackFn(callback, {
        success: false,
        message: error.message || 'Failed to end call',
      });
    } finally {
      session.endSession();
    }
  }
);

export default callEnd;