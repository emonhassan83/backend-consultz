import { Socket } from 'socket.io'
import disconnectHandler from './handlers/disconnect.handler'

export const registerSocketEvents = (socket: Socket) => {
  socket.on('disconnect', disconnectHandler)
}
