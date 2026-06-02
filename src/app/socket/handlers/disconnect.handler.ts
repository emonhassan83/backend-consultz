import { TSocket } from '../interface/socket.interface';
import { getIO } from '../socket.init';
import eventHandler from '../utils/eventHandler';
import onlineUsers from '../utils/onlineUsers';

const disconnectHandler = eventHandler<any>(
  async (socket: TSocket, _data?: any, _ack?: any) => { // ✅ data, ack optional add করো
    try {
      const userId = socket.auth?._id?.toString()

      if (userId) {
        delete onlineUsers[userId]

        const io = getIO()
        io.emit('onlineUser', Object.keys(onlineUsers).length)

        console.log(`👤 User disconnected: ${userId}`)
      }
    } catch (err: any) {
      console.error('❌ Disconnect handler error:', err.message)
    }
  }
)

export default disconnectHandler;