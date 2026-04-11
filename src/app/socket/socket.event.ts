// src/app/socket/socket.event.ts
import { Socket } from 'socket.io';

import myChatListHandler from './handlers/chat/myChatList.handler';
import sendMessageHandler from './handlers/chat/sendMessage.handler';
import seenHandler from './handlers/chat/seen.handler';
import typingHandler from './handlers/chat/typing.handler';
import stopTypingHandler from './handlers/chat/stopTyping.handler';
import disconnectHandler from './handlers/disconnect.handler';
import { TSocket } from './interface/socket.interface';

 const registerSocketEvents = (socket: TSocket) => { // ✅ Socket → TSocket

  socket.on('my-chat-list', (data, callback) => {
    myChatListHandler.call(socket, data, callback)
  })

  socket.on('send-message', (data, callback) => {
    sendMessageHandler.call(socket, data, callback)
  })

  socket.on('seen', (data, callback) => {
    seenHandler.call(socket, data, callback)
  })

  socket.on('typing', (data) => {
    typingHandler.call(socket, data, undefined) // ✅ ack undefined দাও
  })

  socket.on('stopTyping', (data) => {
    stopTypingHandler.call(socket, data, undefined) // ✅ ack undefined দাও
  })

  socket.on('disconnect', () => {
    disconnectHandler.call(socket, undefined, undefined) // ✅ data, ack দুটোই undefined
  })
}

export default registerSocketEvents;