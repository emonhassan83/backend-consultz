// src/app/socket/handlers/call/callInvite.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Calling } from '../../../modules/calling/calling.model';
import { emitToParticipants } from '../../utils/emitToParticipants';

type TCallInvitePayload = {
  callId: string;
};

export const callInvite = eventHandler<TCallInvitePayload>(
  async (socket: TSocket, data, ack) => {
    const authId = socket.auth._id;
    const call = await Calling.findById(data!.callId).populate('participants.user');

    if (!call) {
      return ack!({ success: false, message: 'Call not found.' });
    }

    const participants = call.participants.map(p => p.user!.toString());
    const caller = call.caller.toString();

    // Emit to participants
    emitToParticipants(participants, 'callIncoming', {
      callId: call.id,
      callerId: caller,
      channelName: call.channelName,
      isVideo: call.isVideo,
      status: call.status,
    });

    ack!({ success: true, message: 'Call invitation sent.' });
  }
);