import { Socket } from 'socket.io'

export const registerSocketEvents = (socket: Socket) => {
  console.log(`New client connected: ${socket.id}`)
}
