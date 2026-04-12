// src/app/socket/handlers/call/callAccept.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { emitToParticipants } from '../../utils/emitToParticipants';
import { CALLING_STATUS } from '../../../modules/calling/calling.constant';

type TCallAcceptPayload = {
  callId: string;
};

export const callAccept = eventHandler<TCallAcceptPayload>(
  async (socket: TSocket, data, ack) => {
    const authId = socket.auth._id;
    const call = await Calling.findById(data!.callId);

    if (!call) {
      return ack!({ success: false, message: 'Call not found.' });
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

    ack!({ success: true, message: 'Call accepted.' });
  }
);