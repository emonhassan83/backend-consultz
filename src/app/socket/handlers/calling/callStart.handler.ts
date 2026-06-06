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
import {
  generate32BitUid,
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
    const callerId = socket.auth._id.toString();

    const { bookingId, isVideo = false } = payload ?? {};

    if (!bookingId) {
      return callbackFn(callback, { success: false, message: 'bookingId is required' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const caller = await User.findById(callerId);
      if (!caller || caller.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Caller not found');
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        status: BOOKING_STATUS.confirmed,
        isDeleted: false,
        $or: [{ user: callerId }, { consult: callerId }],
      }).session(session);

      if (!booking) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Valid confirmed booking not found');
      }

      const receiverId = booking.user.toString() === callerId ? booking.consult : booking.user;

      const receiver = await User.findById(receiverId).session(session);
      if (!receiver || receiver.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, 'Receiver not found');
      }

      const channelName = `booking_${booking._id}_${Date.now()}`;

      const callerUid = generate32BitUid();
      const receiverUid = generate32BitUid();

      const callerTokenData = generateAgoraToken({ channelName, uid: callerUid });
      const receiverTokenData = generateAgoraToken({ channelName, uid: receiverUid });

      const [calling] = await Calling.create([{
        caller: (caller._id).toString(),
        receiver: (receiver._id).toString(),
        booking: (booking._id).toString(),
        channelName,
        callId: callerUid,
        isVideo,
        token: callerTokenData.token,
        tokenExpireAt: callerTokenData.expireAt,
        status: CALLING_STATUS.pending,
        participants: [
          { user: (caller._id).toString(), role: 'caller', status: CALLING_STATUS.pending, agoraUid: callerUid, joinedAt: new Date() },
          { user: (receiver._id).toString(), role: 'receiver', status: CALLING_STATUS.pending, agoraUid: receiverUid, joinedAt: null },
        ],
      }] as any, { session });

      await session.commitTransaction();

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
        },
      });

      // ================== PUSH NOTIFICATION LOGIC ==================
      const callIncomingPayload = {
        callId: calling._id.toString(),
        callerId: caller._id.toString(),
        callerName: `${caller.firstName || ''} ${caller.lastName || ''}`.trim(),
        callerPhoto: caller.photoUrl || '',
        isVideo,
        channelName,
        token: receiverTokenData.token,
        uid: receiverUid,
        expireAt: receiverTokenData.expireAt,
      };

      if (receiver.deviceType === 'ios' && receiver.voipToken) {
        // iOS → VoIP Push
        await sendVoIPPush(receiver.voipToken, {
          call_id: calling._id.toString(),
          caller_name: callIncomingPayload.callerName,
          caller_photo: callIncomingPayload.callerPhoto,
          channel_name: channelName,
          agora_token: receiverTokenData.token,
          agora_uid: receiverUid,
          is_video: isVideo,
        });
      } else if (receiver.fcmToken) {
        // Android or fallback → FCM
        await sendDataMessageToToken(receiver.fcmToken, {
          type: 'incoming_call',
          ...callIncomingPayload,
        });
      }

    } catch (error: any) {
      await session.abortTransaction();
      console.error('callStart error:', error.message);
      callbackFn(callback, { success: false, message: error.message });
    } finally {
      session.endSession();
    }
  }
);

export default callStart;
