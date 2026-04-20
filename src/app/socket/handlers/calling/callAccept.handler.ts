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
          participants: call.participants,
          startedAt: call.startedAt,
        }
      );

      // Ack response
      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Call accepted by receiver. Both participants marked as accepted.',
      });

    } catch (err: any) {
      console.error('callAccept error:', err.message);
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default callAccept;
