// src/app/socket/handlers/call/callEnd.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';

type TCallEndPayload = {
  callId: string;
  duration: number;
};

export const callEnd = eventHandler<TCallEndPayload>(
  async (socket: TSocket, data, ack) => {
    const authId = socket.auth._id;
    const call = await Calling.findById(data!.callId);

    if (!call) {
      return ack!({ success: false, message: 'Call not found.' });
    }

    // Update call status and duration
    call.status = CALLING_STATUS.completed;
    call.endedAt = new Date();
    call.duration = data!.duration;
    await call.save();

    emitToParticipants(call.participants.map(p => p?.user!.toString()), 'callEnded', {
      callId: call.id,
      duration: call.duration,
    });

    ack!({ success: true, message: 'Call ended.' });
  }
);