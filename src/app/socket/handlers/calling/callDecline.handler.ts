// src/app/socket/handlers/call/callDecline.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { callbackFn } from '../../../utils/CallbackFn';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';
import httpStatus from 'http-status';

type TCallDeclinePayload = {
  callId: string;
};

export const callDecline = eventHandler<TCallDeclinePayload>(
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

      const participant = call.participants.find(p => p.user!.toString() === authId);
      if (participant) {
        participant.status = CALLING_STATUS.rejected;
        participant.leftAt = new Date();
        await call.save();
      }

      emitToParticipants(call.participants.map(p => p?.user!.toString()), 'callDeclined', {
        callId: call.id,
      });

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call declined.',
      });

    } catch (err: any) {
      console.error('callDecline error:', err.message);
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default callDecline;