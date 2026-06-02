import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Chat } from '../../../modules/chat/chat.models';

const stopTypingHandler = eventHandler<any>(
  async (socket: TSocket, { chatId }: any) => {
    if (!chatId) return;

    const userId = socket.data?.user?._id?.toString() || socket.auth?._id?.toString();

    try {
      const chat = await Chat.findById(chatId);

      if (!chat) return;

      const otherUserId = chat.participants
        .find((p: any) => p.toString() !== userId)
        ?.toString();

      if (otherUserId) {
        socket.to(otherUserId).emit('stopTyping', { userId, chatId });
      }
    } catch (err: any) {
      console.error('stopTyping error:', err.message);
    }
  }
);

export default stopTypingHandler;