import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Chat } from '../../../modules/chat/chat.models';

const typingHandler = eventHandler<any>(
  async (socket: TSocket, { chatId }: any) => {   // ack প্যারামিটার নেই
    if (!chatId) return;

    const userId = socket.data?.user?._id?.toString() || socket.auth?._id?.toString();
    const userName = socket.data?.user?.firstName || 'User';

    try {
      const chat = await Chat.findById(chatId);
      if (!chat) return;

      const otherUserId = chat.participants
        .find((p: any) => p.toString() !== userId)
        ?.toString();

      if (otherUserId) {
        socket.to(otherUserId).emit('typing', { 
          userId, 
          chatId, 
          name: userName 
        });
      }
    } catch (err: any) {
      console.error('typing error:', err.message);
    }
  }
);

export default typingHandler;