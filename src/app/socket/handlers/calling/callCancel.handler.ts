// src/app/socket/handlers/call/callCancel.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';

type TCallCancelPayload = {
  callId: string;
};

export const callCancel = eventHandler<TCallCancelPayload>(
  async (socket: TSocket, data, ack) => {
    const authId = socket.auth._id;
    const call = await Calling.findById(data!.callId);

    if (!call) {
      return ack!({ success: false, message: 'Call not found.' });
    }

    // Only the caller can cancel the call
    if (call.caller.toString() !== authId) {
      return ack!({ success: false, message: 'Only the caller can cancel this call.' });
    }

    call.status = CALLING_STATUS.cancelled;
    await call.save();

    emitToParticipants(call.participants.map(p => p?.user!.toString()), 'callCanceled', {
      callId: call.id,
    });

    ack!({ success: true, message: 'Call canceled.' });
  }
);