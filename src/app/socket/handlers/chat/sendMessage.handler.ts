// src/app/socket/handlers/chat/sendMessage.handler.ts
import { TSocket } from '../../interface/socket.interface';
import eventHandler from '../../utils/eventHandler';
import { Chat } from '../../../modules/chat/chat.models';
import { Message } from '../../../modules/messages/messages.models';
import { chatService } from '../../../modules/chat/chat.service';
import { CHAT_STATUS } from '../../../modules/chat/chat.constants';
import httpStatus from 'http-status';
import { callbackFn } from '../../../utils/CallbackFn';

const sendMessageHandler = eventHandler(
  async (socket: TSocket, payload: any, callback: any) => {
    const userId = socket.auth._id.toString();
    const { receiverId, text, imageUrl = [], bookingId } = payload;

    console.log('📨 send-message received from:', userId, 'to:', receiverId);

    try {
      if (!receiverId) {
        return callbackFn(callback, { success: false, message: 'receiverId is required' });
      }
      if (!text?.trim() && (!imageUrl || imageUrl.length === 0)) {
        return callbackFn(callback, { success: false, message: 'text or imageUrl is required' });
      }

      const receiverExists = await chatService.checkUserExists(receiverId);
      if (!receiverExists) {
        return callbackFn(callback, { success: false, message: 'Receiver not found' });
      }

      let chat = null;

      if (bookingId) {
        chat = await Chat.findOne({ booking: bookingId, participants: { $all: [userId, receiverId] } });
      }
      if (!chat) {
        chat = await Chat.findOne({ participants: { $all: [userId, receiverId] } });
      }
      if (!chat) {
        chat = await Chat.create({
          booking: bookingId || null,
          participants: [userId, receiverId],
          status: CHAT_STATUS.accepted,
        });
      }

      const message = await Message.create({
        chat: chat._id,
        sender: userId,
        receiver: receiverId,
        text,
        imageUrl,
      });

      const populated = await Message.findById(message._id)
        .populate('sender', 'firstName lastName photoUrl _id')
        .populate('receiver', 'firstName lastName photoUrl _id');

      // Emit new message to both users
      socket.emit('new-message', populated); // Emit to sender
      socket.to(receiverId).emit('new-message', populated); // Emit to receiver

      // Update chat list for both
      const [senderChatList, receiverChatList] = await Promise.all([
        chatService.getMyChatList(userId, {}),
        chatService.getMyChatList(receiverId, {}),
      ]);

      socket.emit('chat-list', senderChatList); // Update sender's chat list
      socket.to(receiverId).emit('chat-list', receiverChatList); // Update receiver's chat list

      // Unread notification count
      const unreadCount = await Message.countDocuments({
        receiver: receiverId,
        seen: false,
      });
      socket.to(receiverId).emit('new-notifications', unreadCount); // Notify receiver

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Message sent successfully!',
        populated,
      });
    } catch (err: any) {
      console.error('❌ send-message error:', err.message);
      callbackFn(callback, { success: false, message: err.message });
    }
  }
);

export default sendMessageHandler;