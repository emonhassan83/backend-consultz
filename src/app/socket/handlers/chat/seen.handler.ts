import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Chat } from '../../../modules/chat/chat.models';
import { Message } from '../../../modules/messages/messages.models';
import { chatService } from '../../../modules/chat/chat.service';
import { Types } from 'mongoose';
import { callbackFn } from '../../../utils/CallbackFn';

const seenHandler = eventHandler(async (socket: TSocket, { chatId }: any, callback: any) => {
  const userId = socket.data.user._id.toString();

  if (!chatId) {
    return callbackFn(callback, { success: false, message: 'chatId is required' });
  }

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return callbackFn(callback, { success: false, message: 'Chat not found' });
    }

     // current user ছাড়া বাকিদের messages seen করো
    await Message.updateMany(
      {
        chat: chatId,
        seen: false,
        sender: { $ne: new Types.ObjectId(userId) },
      },
      { $set: { seen: true } }
    );

    // সব participants এর chat-list এবং unread update করো
    const participantIds = chat.participants.map((p) => p.toString());

    await Promise.all(
      participantIds.map(async (participantId) => {
        const [chatList, unreadCount] = await Promise.all([
          chatService.getMyChatList(participantId, {}),
          Message.countDocuments({ receiver: participantId, seen: false }),
        ]);

        socket.to(participantId).emit('chat-list', chatList);
        socket.to(participantId).emit('new-notifications', unreadCount);
      })
    );

    callbackFn(callback, { success: true });
  } catch (err: any) {
    callbackFn(callback, { success: false, message: err.message });
  }
});

export default seenHandler;