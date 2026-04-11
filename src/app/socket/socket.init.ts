import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { socketAuth } from './utils/socket.auth'
import onlineUsers from './utils/onlineUsers'
import { TSocket } from './interface/socket.interface'
import registerSocketEvents from './socket.event'

let ioInstance: Server | null = null

const initializeSocketIO = (server: HttpServer) => {
  ioInstance = new Server(server, {
    cors: { origin: '*', credentials: true },
  })

  // Middleware
  ioInstance.use(socketAuth);

ioInstance.on('connection', (socket: any) => {
  try {
    const userId = socket.auth?._id?.toString();
    if (!userId) {
      socket.disconnect();
      return;
    }

    const tSocket = socket as TSocket;
    tSocket.data = { user: socket.auth };   // যদি কোথাও data.user ব্যবহার করেন

    tSocket.join(userId);
    onlineUsers[userId] = tSocket;

    console.log(`✅ User connected: ${userId}`);

    registerSocketEvents(tSocket);

  } catch (err: any) {
    console.error('Connection error:', err.message);
    socket.disconnect();
  }
});

  return ioInstance
}

export const getIO = (): Server => {
  if (!ioInstance) throw new Error('Socket.IO not initialized')
  return ioInstance
}

export default initializeSocketIO
