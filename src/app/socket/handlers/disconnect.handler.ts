import { chatService } from '../../modules/chat/chat.service';
import { Message } from '../../modules/messages/messages.models';
import { TSocket } from '../interface/socket.interface';
import { getIO } from '../socket.init';
import eventHandler from '../utils/eventHandler';
import onlineUsers from '../utils/onlineUsers';

const disconnectHandler = eventHandler(async (socket: TSocket) => {
  try {
    const userId = socket.data?.user?._id?.toString();

    if (!userId) return;

    // Remove from online users
    delete onlineUsers[userId];        // ← delete ব্যবহার করুন (Set নয়)

    const io = getIO();
    io.emit('onlineUser', Object.keys(onlineUsers).length);

    console.log(`👤 User disconnected: ${userId} | Online: ${Object.keys(onlineUsers).length}`);

    // Get updated chat list for this user
    const chatList = await chatService.getMyChatList(userId, {});

    // Emit to current user
    io.to(userId).emit('chat-list', chatList);

    // Emit updated chat list to other online participants
    // (যাতে তাদের chat list-এ online/offline status আপডেট হয়)
    for (const chat of chatList) {
      const otherParticipantIds = chat.participants
        ?.filter((p: any) => p._id.toString() !== userId)
        .map((p: any) => p._id.toString()) || [];

      for (const participantId of otherParticipantIds) {
        if (onlineUsers[participantId]) {
          const updatedChatList = await chatService.getMyChatList(participantId, {});
          io.to(participantId).emit('chat-list', updatedChatList);
        }
      }
    }

    // Optional: unread count
    const unreadCount = await Message.countDocuments({
      receiver: userId,
      seen: false,
    });
    io.to(userId).emit('new-notifications', unreadCount);

  } catch (error: any) {
    console.error('❌ Disconnect handler error:', error.message);
  }
});

export default disconnectHandler;