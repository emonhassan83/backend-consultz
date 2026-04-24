// src/app/socket/socket.event.ts
import { Socket } from 'socket.io';
import { TSocket } from './interface/socket.interface';

import myChatListHandler from './handlers/chat/myChatList.handler';
import sendMessageHandler from './handlers/chat/sendMessage.handler';
import seenHandler from './handlers/chat/seen.handler';
import typingHandler from './handlers/chat/typing.handler';
import stopTypingHandler from './handlers/chat/stopTyping.handler';
import disconnectHandler from './handlers/disconnect.handler';
import { callAccept } from './handlers/calling/callAccept.handler';
import { callCancel } from './handlers/calling/callCancel.handler';
import { callDecline } from './handlers/calling/callDecline.handler';
import callEnd from './handlers/calling/callEnd.handler';
import { callInvite } from './handlers/calling/callInvite.handler';
import editMessageHandler from './handlers/chat/editMessage.handler';
import deleteMessageHandler from './handlers/chat/deleteMessage.handler';
import callStart from './handlers/calling/callStart.handler';
import { bookingComplete } from './handlers/calling/bookingCompleted.handler';

export const registerSocketEvents = (socket: Socket) => {
  const tSocket = socket as TSocket; // Cast to TSocket

   // chat events
  tSocket.on('my-chat-list', (data, callback) => myChatListHandler.call(tSocket, data, callback));
  tSocket.on('send-message', (data, callback) => sendMessageHandler.call(tSocket, data, callback));
  tSocket.on('edit-message', (data, callback) => editMessageHandler.call(tSocket, data, callback));
  tSocket.on('delete-message', (data, callback) => deleteMessageHandler.call(tSocket, data, callback));
  tSocket.on('seen', (data, callback) => seenHandler.call(tSocket, data, callback));

  tSocket.on('typing', (data) => typingHandler.call(tSocket, data));
  tSocket.on('stop-typing', (data) => stopTypingHandler.call(tSocket, data));
  tSocket.on('disconnect', () => disconnectHandler.call(tSocket, undefined));

  // 📞 calling events
 tSocket.on('call-start', (data, callback) => {
    console.log('📡 call-start event received | callback type:', typeof callback);
    callStart.call(tSocket, data, callback);   // এটি ঠিক আছে
  });
  tSocket.on('call-accept', (data, callback) => callAccept.call(tSocket, data, callback));
  tSocket.on('call-cancel', (data, callback) => callCancel.call(tSocket, data, callback));
  tSocket.on('call-decline', (data, callback) => callDecline.call(tSocket, data, callback));
  tSocket.on('call-end', (data, callback) => callEnd.call(tSocket, data, callback));
  tSocket.on('booking-complete', (data, callback) => bookingComplete.call(tSocket, data, callback));
  tSocket.on('call-invite', (data, callback) => callInvite.call(tSocket, data, callback));
};

export default registerSocketEvents;