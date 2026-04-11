import { TSocket } from '../../interface/socket.interface'
import eventHandler from '../../utils/eventHandler'
import { Chat } from '../../../modules/chat/chat.models'
import { Message } from '../../../modules/messages/messages.models'
import { chatService } from '../../../modules/chat/chat.service'
import { CHAT_STATUS } from '../../../modules/chat/chat.constants'
import httpStatus from 'http-status'
import { callbackFn } from '../../../utils/CallbackFn'

const sendMessageHandler = eventHandler(
  async (socket: TSocket, payload: any, callback: any) => {
    const userId = socket.auth._id.toString()
    const { receiverId, text, imageUrl = [], bookingId } = payload

    console.log('📨 send-message received:', {
      receiverId,
      text,
      bookingId,
      userId,
    })

    try {
      if (!receiverId) {
        return callbackFn(callback, {
          success: false,
          message: 'receiverId is required',
        })
      }
      if (!text?.trim() && (!imageUrl || imageUrl.length === 0)) {
        return callbackFn(callback, {
          success: false,
          message: 'text or imageUrl is required',
        })
      }

      // Validate receiver existence
      const receiverExists = await chatService.checkUserExists(receiverId)
      if (!receiverExists) {
        return callbackFn(callback, {
          success: false,
          message: 'Receiver not found',
        })
      }

      let chat = null

      // Priority 1: bookingId দিয়ে খুঁজুন
      if (bookingId) {
        chat = await Chat.findOne({
          booking: bookingId,
          participants: { $all: [userId, receiverId] },
        })
        console.log('💬 Found chat by bookingId:', chat?._id || 'NOT FOUND')
      }

      // Priority 2: যদি bookingId না থাকে বা না পাওয়া যায়, তাহলে participants দিয়ে খুঁজব
      if (!chat) {
        chat = await Chat.findOne({
          participants: { $all: [userId, receiverId] },
        })
        console.log('💬 Found chat by participants:', chat?._id || 'NOT FOUND')
      }

      // Priority 3: যদি কোনো চ্যাট না পাওয়া যায়, তাহলে নতুন চ্যাট তৈরি করব
      if (!chat) {
        chat = await Chat.create({
          booking: bookingId || null,
          participants: [userId, receiverId],
          status: CHAT_STATUS.accepted,
        })
        console.log('💬 New chat created:', chat._id)
      }

      const message = await Message.create({
        chat: chat._id,
        sender: userId,
        receiver: receiverId,
        text,
        imageUrl,
      })

      const populated = await Message.findById(message._id)
        .populate('sender', 'firstName lastName photoUrl _id')
        .populate('receiver', 'firstName lastName photoUrl _id')

      // Emit new message
      socket.to(userId).emit('new-message', populated) // ioInstance!.to → socket.to (room)
      socket.to(receiverId).emit('new-message', populated)

      // Update chat list for both
      const [senderChatList, receiverChatList] = await Promise.all([
        chatService.getMyChatList(userId, {}),
        chatService.getMyChatList(receiverId, {}),
      ])

      socket.to(userId).emit('chat-list', senderChatList)
      socket.to(receiverId).emit('chat-list', receiverChatList)

      // Unread count
      const unreadCount = await Message.countDocuments({
        receiver: receiverId,
        seen: false,
      })
      socket.to(receiverId).emit('new-notifications', unreadCount)

      callbackFn(callback, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Message sent successfully!',
        data: populated,
      })
    } catch (err: any) {
      console.error('send-message error:', err.message)
      callbackFn(callback, { success: false, message: err.message })
    }
  },
)

export default sendMessageHandler
