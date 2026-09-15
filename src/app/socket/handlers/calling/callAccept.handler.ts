// src/app/socket/handlers/call/callAccept.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { callbackFn } from '../../../utils/CallbackFn';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';
import httpStatus from 'http-status';
import { Booking } from '../../../modules/booking/booking.models';
import {
  generateAgoraToken,
  generateAgoraUidFromUserId,
} from '../../../modules/calling/calling.utils';

type TCallAcceptPayload = {
  callId: string;
};

export const callAccept = eventHandler<TCallAcceptPayload>(
  async (socket: TSocket, data, callback) => {
    const authId = socket.auth._id.toString();

    if (!data?.callId) {
      return callbackFn(callback, { success: false, message: 'callId is required' });
    }

    try {
      const call = await Calling.findOne({ _id: data.callId, isDeleted: false });

      if (!call) {
        return callbackFn(callback, { success: false, message: 'Call not found.' });
      }

      const isParticipant =
        call.caller.toString() === authId ||
        call.receiver.toString() === authId ||
        call.participants.some((p: any) => p.user?.toString() === authId);

      if (!isParticipant) {
        return callbackFn(callback, {
          statusCode: httpStatus.FORBIDDEN,
          success: false,
          message: 'Unauthorized to accept this call.',
        });
      }

      if (
        ([
          CALLING_STATUS.completed,
          CALLING_STATUS.ended,
          CALLING_STATUS.rejected,
          CALLING_STATUS.missed,
          CALLING_STATUS.cancelled,
        ] as string[]).includes(call.status)
      ) {
        return callbackFn(callback, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Call is no longer active.',
        });
      }

      const booking = await Booking.findById(call.booking).select('_id user consult');
      if (!booking) {
        return callbackFn(callback, {
          statusCode: httpStatus.NOT_FOUND,
          success: false,
          message: 'Booking not found.',
        });
      }

      const participant = call.participants.find(
        (p: any) => p.user?.toString() === authId,
      );
      const uid =
        participant?.agoraUid || generateAgoraUidFromUserId(authId);
      const tokenData = generateAgoraToken({
        channelName: call.channelName,
        uid,
      });

      // ✅ যেহেতু one-to-one call → receiver accept করলে উভয়ের status accepted হবে
      const now = new Date();
      call.participants.forEach((p) => {
        p.status = CALLING_STATUS.accepted;
        if (!p.joinedAt) {
          p.joinedAt = now;
        }
      });

      // Call status update
      call.status = CALLING_STATUS.accepted;
      call.startedAt = now;
      await call.save();

      // Emit event to both participants
      emitToParticipants(
        call.participants.map((p) => p.user!.toString()),
        'callAccepted',
        {
          callId: call.id,
          call_id: call.id,
          channelName: call.channelName,
          channel_name: call.channelName,
          isVideo: call.isVideo,
          is_video: call.isVideo,
          participants: call.participants,
          startedAt: call.startedAt,
        }
      );

      // Ack response
      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call accepted by receiver. Both participants marked as accepted.',
        data: {
          call_id: call._id.toString(),
          callId: call._id.toString(),
          channel_name: call.channelName,
          channelName: call.channelName,
          agora_token: tokenData.token,
          agora_uid: uid,
          token: tokenData.token,
          uid,
          expireAt: tokenData.expireAt,
          is_video: call.isVideo,
          isVideo: call.isVideo,
          bookingId: booking._id.toString(),
          expertId: booking.consult.toString(),
          userId: booking.user.toString(),
        },
      });

    } catch (err: any) {
      console.error('callAccept error:', err.message);
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default callAccept;
