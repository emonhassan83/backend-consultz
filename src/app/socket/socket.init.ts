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
      // socketAuth middleware সফলভাবে চললে এখানে আসবে
      const userId = socket.auth?._id?.toString();   // string করে নিন

      if (!userId) {
        console.error('No userId found after auth');
        socket.disconnect();
        return;
      }

        // ✅ socket কে TSocket হিসেবে cast করো
    const tSocket = socket as TSocket

    // user data সেট করো
    tSocket.data = { user: socket.auth }

    // personal room এ join করো
    tSocket.join(userId)

    onlineUsers[userId] = tSocket

    console.log(`✅ User connected: ${userId} | Socket ID: ${socket.id}`)

    registerSocketEvents(tSocket) // ✅ TSocket পাঠাও

  } catch (err: any) {
    console.error('Connection error:', err.message)
    socket.disconnect()
  }
  });

  return ioInstance
}

export const getIO = (): Server => {
  if (!ioInstance) throw new Error('Socket.IO not initialized')
  return ioInstance
}

export default initializeSocketIO
