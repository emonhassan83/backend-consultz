// src/app/socket/handlers/call/callInvite.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { callbackFn } from '../../../utils/CallbackFn';
import { emitToParticipants } from '../../utils/emitToParticipants';
import httpStatus from 'http-status';

type TCallInvitePayload = {
  callId: string;
};

export const callInvite = eventHandler<TCallInvitePayload>(
  async (socket: TSocket, data, callback) => {
    const authId = socket.auth._id;

    if (!data?.callId) {
      return callbackFn(callback, { 
        success: false, 
        message: 'callId is required' 
      });
    }

    try {
      const call = await Calling.findById(data.callId).populate('participants.user');

      if (!call) {
        return callbackFn(callback, { 
          success: false, 
          message: 'Call not found.' 
        });
      }

      const participants = call.participants.map(p => p.user!.toString());
      const caller = call.caller.toString();

      // Emit to all participants
      emitToParticipants(participants, 'callIncoming', {
        callId: call.id,
        callerId: caller,
        channelName: call.channelName,
        isVideo: call.isVideo,
        status: call.status,
      });

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call invitation sent.',
      });

    } catch (err: any) {
      console.error('callInvite error:', err.message);
      callbackFn(callback, { 
        success: false, 
        message: err.message 
      });
    }
  }
);

export default callInvite;