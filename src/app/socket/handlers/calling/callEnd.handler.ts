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
import { bookingComplete } from './bookingCompleted.handler';

type TCallEndPayload = {
  callId: string;
  duration?: number;
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
      const call = await Calling.findOne({
        _id: callId,
        $or: [{ caller: userId }, { receiver: userId }],
        isDeleted: false,
      }).session(session);

      if (!call) {
        throw new AppError(httpStatus.NOT_FOUND, 'Call session not found or unauthorized');
      }

      // 🔥 If call already ended → skip everything
      if (call.status === CALLING_STATUS.ended || call.status === CALLING_STATUS.completed) {
        console.log(`⚠️ Call ${callId} already ended. Skipping duplicate.`);
        await session.commitTransaction();
        return callbackFn(callback, {
          success: true,
          message: 'Call already ended',
        });
      }

      // Calculate duration
      const now = new Date();
      const startTime = call.startedAt || call.createdAt;
      const finalDuration = clientDuration ?? 
        Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // Update call status
      call.status = CALLING_STATUS.ended;
      call.endedAt = now;
      call.duration = finalDuration;
      await call.save({ session });

      await session.commitTransaction();

      // ================== Trigger Booking Completion (Only Once) ==================
      // bookingComplete handler-এ idempotency আছে, তাই নিরাপদে কল করা যায়
      await bookingComplete.call(socket, {
        bookingId: call.booking.toString(),
        callId: call._id.toString(),
        duration: finalDuration,
      });

      // Notify both users (call ended)
      const [caller, receiver] = await Promise.all([
        User.findById(call.caller),
        User.findById(call.receiver),
      ]);

      const tokens: string[] = [];
      if (caller?.fcmToken) tokens.push(caller.fcmToken);
      if (receiver?.fcmToken) tokens.push(receiver.fcmToken);

      if (tokens.length > 0) {
        await sendNotification(tokens, {
          receiver: caller?._id || receiver?._id,
          message: 'Call Ended',
          description: `Your ${call.isVideo ? 'video' : 'voice'} call has ended. Duration: ${Math.floor(finalDuration / 60)} min`,
          reference: call._id,
          modelType: modeType.Calling,
        });
      }

      // Emit to clients
      const participants = [call.caller.toString(), call.receiver.toString()];
      socket.to(participants).emit('callEnded', {
        callId: call._id,
        duration: finalDuration,
        endedAt: now,
      });

      socket.emit('callEnded', {
        callId: call._id,
        duration: finalDuration,
        endedAt: now,
      });

      callbackFn(callback, {
        success: true,
        message: 'Call ended successfully',
        data: { callId: call._id, duration: finalDuration },
      });

    } catch (error: any) {
      await session.abortTransaction();
      console.error('❌ Call end error:', error.message);
      callbackFn(callback, { success: false, message: error.message });
    } finally {
      session.endSession();
    }
  }
);

export default callEnd;