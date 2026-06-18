// src/app/socket/handlers/chat/seen.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Chat } from '../../../modules/chat/chat.models';
import { Message } from '../../../modules/messages/messages.models';
import { chatService } from '../../../modules/chat/chat.service';
import { Types } from 'mongoose';
import { callbackFn } from '../../../utils/CallbackFn';

const seenHandler = eventHandler(async (socket: TSocket, { chatId, bookingId }: any, callback: any) => {
  const userId = socket.auth._id.toString();

  // ✅ chatId অথবা bookingId যেকোনো একটা থাকলেই চলবে
  if (!chatId && !bookingId) {
    return callbackFn(callback, { success: false, message: 'chatId or bookingId is required' });
  }

  try {
    let chat: any = null;

    if (chatId) {
      chat = await Chat.findById(chatId);
    } else if (bookingId) {
      // ✅ bookingId দিয়ে chat খুঁজে নাও
      chat = await Chat.findOne({ booking: new Types.ObjectId(bookingId) });
    }

    if (!chat) {
      return callbackFn(callback, { success: false, message: 'Chat not found' });
    }

    const resolvedChatId = chat._id.toString();

    // 1. Current user ছাড়া বাকি সবার messages seen করো
    await Message.updateMany(
      {
        chat: new Types.ObjectId(resolvedChatId),
        seen: false,
        sender: { $ne: new Types.ObjectId(userId) },
      },
      { $set: { seen: true } },
    );

    // 2. Updated single chat fetch করো
    const updatedSingleChat = await chatService.getSingleChat(resolvedChatId, userId);
    if (!updatedSingleChat) {
      return callbackFn(callback, { success: false, message: 'Failed to fetch updated chat' });
    }

    // 3. সব participants কে notify করো
    const participantIds = chat.participants.map((p: any) => p.toString());

    await Promise.all(
      participantIds.map(async (participantId: string) => {
        socket.to(participantId).emit('chat-list', updatedSingleChat);

        const unreadCount = await Message.countDocuments({
          receiver: participantId,
          seen: false,
        });
        socket.to(participantId).emit('new-notifications', unreadCount);
      }),
    );

    callbackFn(callback, { success: true, chatId: resolvedChatId });
  } catch (err: any) {
    console.error('seen handler error:', err.message);
    callbackFn(callback, { success: false, message: err.message });
  }
});

export default seenHandler;