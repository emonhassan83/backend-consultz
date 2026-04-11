// src/app/socket/socket.event.ts
import { Socket } from 'socket.io';
import { TSocket } from './interface/socket.interface';

import myChatListHandler from './handlers/chat/myChatList.handler';
import sendMessageHandler from './handlers/chat/sendMessage.handler';
import seenHandler from './handlers/chat/seen.handler';
import typingHandler from './handlers/chat/typing.handler';
import stopTypingHandler from './handlers/chat/stopTyping.handler';
import disconnectHandler from './handlers/disconnect.handler';

export const registerSocketEvents = (socket: Socket) => {
  const tSocket = socket as TSocket; // Cast to TSocket

  tSocket.on('my-chat-list', (data, callback) => myChatListHandler.call(tSocket, data, callback));
  tSocket.on('send-message', (data, callback) => sendMessageHandler.call(tSocket, data, callback));
  tSocket.on('seen', (data, callback) => seenHandler.call(tSocket, data, callback));

  tSocket.on('typing', (data) => typingHandler.call(tSocket, data));
  tSocket.on('stopTyping', (data) => stopTypingHandler.call(tSocket, data));
  tSocket.on('disconnect', () => disconnectHandler.call(tSocket, undefined));
};

export default registerSocketEvents;