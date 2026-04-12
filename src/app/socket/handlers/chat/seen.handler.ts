// src/app/socket/handlers/chat/seen.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Chat } from '../../../modules/chat/chat.models';
import { Message } from '../../../modules/messages/messages.models';
import { chatService } from '../../../modules/chat/chat.service';
import { Types } from 'mongoose';
import { callbackFn } from '../../../utils/CallbackFn';

const seenHandler = eventHandler(async (socket: TSocket, { chatId }: any, callback: any) => {
  const userId = socket.auth._id.toString();

  if (!chatId) {
    return callbackFn(callback, { success: false, message: 'chatId is required' });
  }

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return callbackFn(callback, { success: false, message: 'Chat not found' });
    }

    // 1. Current user ছাড়া বাকি সবার messages seen করো
    await Message.updateMany(
      {
        chat: chatId,
        seen: false,
        sender: { $ne: new Types.ObjectId(userId) },
      },
      { $set: { seen: true } }
    );

    // 2. শুধুমাত্র এই chatId এর updated version নিন (full list না)
    const updatedSingleChat = await chatService.getSingleChat(chatId, userId); 
    if (!updatedSingleChat) {
      return callbackFn(callback, { success: false, message: 'Failed to fetch updated chat' });
    }

    // 3. সব participants কে শুধু এই single chat
    const participantIds = chat.participants.map((p) => p.toString());

    await Promise.all(
      participantIds.map(async (participantId) => {
        // শুধু এই chat এর আপডেট পাঠান
        socket.to(participantId).emit('chat-list', updatedSingleChat);

        // Unread count আপডেট
        const unreadCount = await Message.countDocuments({
          receiver: participantId,
          seen: false,
        });
        socket.to(participantId).emit('new-notifications', unreadCount);
      })
    );

    // Caller কে success পাঠান
    callbackFn(callback, { success: true });
  } catch (err: any) {
    console.error('seen handler error:', err.message);
    callbackFn(callback, { success: false, message: err.message });
  }
});

export default seenHandler;