// src/app/socket/handlers/call/callEnd.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { Payment } from '../../../modules/payment/payment.model';
import { Withdraw } from '../../../modules/withdraw/withdraw.model';
import { User } from '../../../modules/user/user.model';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import AppError from '../../../errors/AppError';
import dayjs from 'dayjs';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';
import { Booking } from '../../../modules/booking/booking.models';
import { BOOKING_STATUS } from '../../../modules/booking/booking.constants';
import { Contents } from '../../../modules/contents/contents.models';
import { WITHDRAW_STATUS } from '../../../modules/withdraw/withdraw.constant';
import { sendNotification } from '../../../utils/sentNotification';
import { modeType } from '../../../modules/notification/notification.interface';
import { sendWithdrawNotify } from '../../../modules/withdraw/withdraw.utils';

type TCallEndPayload = {
  callId: string;
  duration?: number;        // client থেকে optional duration পাঠাতে পারে
};

const callEnd = eventHandler<TCallEndPayload>(
  async (socket: TSocket, data, ack) => {
    const userId = socket.auth._id.toString();
    const { callId, duration: clientDuration } = data || {};

    if (!callId) {
      return ack?.({ success: false, message: 'callId is required' });
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

      if (call.status === CALLING_STATUS.completed) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Call already ended');
      }

      // 2. Calculate duration
      const now = new Date();
      const startTime = call.startedAt || call.createdAt;
      const finalDuration = clientDuration ?? 
        Math.floor((now.getTime() - startTime.getTime()) / 1000);

      // 3. Update call
      call.status = CALLING_STATUS.completed;
      call.endedAt = now;
      call.duration = finalDuration;
      await call.save({ session });

      // 4. Complete booking
      const booking = await Booking.findById(call.booking).session(session);
      if (!booking) throw new AppError(httpStatus.NOT_FOUND, 'Booking not found');

      booking.status = BOOKING_STATUS.completed;
      await booking.save({ session });

      // 5. Payment & Withdraw
      const payment = await Payment.findOne({
        booking: booking._id,
        isDeleted: false,
      }).session(session);

      if (!payment) throw new AppError(httpStatus.NOT_FOUND, 'Payment not found');

      const contents = await Contents.findOne().lean();
      const holdDays = contents?.paymentHoldDays || 7;
      const proceedAt = dayjs(now).add(holdDays, 'day').toDate();

      const [withdraw] = await Withdraw.create(
        [{
          user: booking.consult,
          booking: booking._id,
          amount: payment.consultAmount,
          status: WITHDRAW_STATUS.proceed,
          proceedAt,
        }],
        { session }
      );

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
          description: `Your ${call.isVideo ? 'video' : 'voice'} call has ended. Duration: ${Math.floor(finalDuration / 60)} min`,
          reference: call._id,
          modelType: modeType.Calling,
        });
      }

      // 7. Withdraw notification to consultant
      if (caller?._id.toString() === booking.consult.toString()) {
        await sendWithdrawNotify(WITHDRAW_STATUS.proceed, withdraw, caller);
      }

      await session.commitTransaction();

      // 8. Emit to all participants
      const participants = [call.caller.toString(), call.receiver.toString()];
      socket.to(participants).emit('callEnded', {
        callId: call._id,
        duration: finalDuration,
        endedAt: now,
        status: CALLING_STATUS.completed,
      });

      // Caller-কে নিজের socket-এও পাঠান
      socket.emit('callEnded', {
        callId: call._id,
        duration: finalDuration,
        endedAt: now,
        status: CALLING_STATUS.completed,
      });

      ack?.({ 
        success: true, 
        message: 'Call ended successfully'
      });

    } catch (error: any) {
      await session.abortTransaction();
      console.error('Call end error:', error.message);
      ack?.({ success: false, message: error.message });
    } finally {
      session.endSession();
    }
  }
);

export default callEnd;