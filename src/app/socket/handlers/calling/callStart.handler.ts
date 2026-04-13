// src/app/socket/handlers/call/callStart.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { User } from '../../../modules/user/user.model';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import AppError from '../../../errors/AppError';
import { Booking } from '../../../modules/booking/booking.models';
import { BOOKING_STATUS } from '../../../modules/booking/booking.constants';
import { generateAgoraToken } from '../../../modules/calling/calling.utils';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';

type TCallStartPayload = {
  bookingId: string;
  isVideo: boolean;
};

const callStart = eventHandler<TCallStartPayload>(
  async (socket: TSocket, payload, ack) => {
    const callerId = socket.auth._id.toString();
    
    if (!payload) {
      return ack?.({ success: false, message: 'Payload is required' });
    }

    const { bookingId, isVideo } = payload;

    if (!bookingId) {
      return ack?.({ success: false, message: 'bookingId is required' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Validate caller
      const caller = await User.findById(callerId);
      if (!caller || caller.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Caller not found');
      }

      // 2. Validate booking
      const booking = await Booking.findOne({
        _id: bookingId,
        consult: callerId,
        status: BOOKING_STATUS.confirmed,
        isDeleted: false,
      }).session(session);

      if (!booking) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Valid confirmed booking not found');
      }

      // 3. Get receiver
      const receiver = await User.findById(booking.user).session(session);
      if (!receiver || receiver.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found');
      }

      // 4. Create unique channel
      const channelName = `booking_${booking._id}_${Date.now()}`;

      // 5. Generate Agora token
      const uid = Number(Date.now());
      const tokenData = generateAgoraToken({
        channelName,
        uid,
      });

      // 6. Create Calling document
      const [calling] = await Calling.create(
        [{
          caller: caller._id,
          receiver: receiver._id,
          booking: booking._id,
          channelName,
          callId: uid,
          isVideo,
          token: tokenData.token,
          tokenExpireAt: tokenData.expireAt,
          status: CALLING_STATUS.pending,
        }],
        { session }
      );

      await session.commitTransaction();

      // 7. Return data to caller
      const responseData = {
        callId: calling._id,
        channelName,
        token: tokenData.token,
        uid,
        expireAt: tokenData.expireAt,
        isVideo,
      };

      // Caller কে success response দাও
      ack?.({ 
        success: true, 
        message: 'Call started successfully',
        data: responseData 
      });

      // 8. Emit call invite to receiver
      socket.to(receiver._id.toString()).emit('callIncoming', {
        callId: calling._id,
        callerId: caller._id,
        callerName: caller.firstName + ' ' + (caller.lastName || ''),
        isVideo,
        channelName,
        // token পাঠাবে না — receiver নিজে /token API বা অন্য socket দিয়ে নিবে
      });

      console.log(`📞 Call started by ${callerId} to ${receiver._id}`);

    } catch (error: any) {
      await session.abortTransaction();
      console.error('Call start error:', error.message);
      ack?.({ success: false, message: error.message });
    } finally {
      session.endSession();
    }
  }
);

export default callStart;