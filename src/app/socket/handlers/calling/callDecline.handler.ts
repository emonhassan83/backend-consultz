// src/app/socket/handlers/call/callDecline.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';

type TCallDeclinePayload = {
  callId: string;
};

export const callDecline = eventHandler<TCallDeclinePayload>(
  async (socket: TSocket, data, ack) => {
    const authId = socket.auth._id;
    const call = await Calling.findById(data!.callId);

    if (!call) {
      return ack!({ success: false, message: 'Call not found.' });
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

    ack!({ success: true, message: 'Call declined.' });
  }
);