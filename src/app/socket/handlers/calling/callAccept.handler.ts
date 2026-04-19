// src/app/socket/handlers/call/callAccept.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { callbackFn } from '../../../utils/CallbackFn';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';
import httpStatus from 'http-status';

type TCallAcceptPayload = {
  callId: string;
};

export const callAccept = eventHandler<TCallAcceptPayload>(
  async (socket: TSocket, data, callback) => {
    const authId = socket.auth._id;

    if (!data?.callId) {
      return callbackFn(callback, { success: false, message: 'callId is required' });
    }

    try {
      const call = await Calling.findById(data.callId);

      if (!call) {
        return callbackFn(callback, { success: false, message: 'Call not found.' });
      }

      // Update participant's status
      const participant = call.participants.find(p => p.user!.toString() === authId);
      if (participant) {
        participant.status = CALLING_STATUS.accepted;
        participant.joinedAt = new Date();
        await call.save();
      }

      emitToParticipants(call.participants.map(p => p.user!.toString()), 'callAccepted', {
        callId: call.id,
        participants: call.participants,
      });

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call accepted.',
      });

    } catch (err: any) {
      console.error('callAccept error:', err.message);
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default callAccept;