import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import httpStatus from 'http-status'
import { Types } from 'mongoose'
import getUserDetailsFromToken from '../utils/vaildateUserFromToken'
import AppError from '../errors/AppError'
import { callbackFn } from '../utils/CallbackFn'
import { Chat } from '../modules/chat/chat.models'
import { Message } from '../modules/messages/messages.models'
import { chatService } from '../modules/chat/chat.service'
import { CHAT_STATUS } from '../modules/chat/chat.constants'

let ioInstance: Server | null = null

const initializeSocketIO = (server: HttpServer) => {
  ioInstance = new Server(server, {
    cors: { origin: '*', credentials: true },
  })

  const onlineUser = new Set<string>()

  ioInstance.on('connection', async (socket: Socket) => {
    console.log('connected:', socket.id)

    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.token

      let user: any
      try {
        user = await getUserDetailsFromToken(token)
        if (!user) throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid token')
      } catch (err) {
        console.log(err)
        socket.disconnect()
        return
      }

      const userId = user._id.toString()
      socket.data.user = user

      // ✅ user এর নিজস্ব room এ join করো
      socket.join(userId)
      onlineUser.add(userId)
      ioInstance!.emit('onlineUser', onlineUser.size)

      console.log('✅ User connected:', userId, '| socket.id:', socket.id)
      console.log('✅ Joined room:', userId)

      // =============================================
      // EVENT: my-chat-list
      // =============================================
      socket.on('my-chat-list', async (_, callback) => {
        try {
          console.log('📋 my-chat-list event received for userId:', userId)

          const chatList = await chatService.getMyChatList(userId, {})
          console.log('📋 chatList fetched, count:', chatList?.length || 0)

          socket.emit('chat-list', chatList)
          console.log('📋 chat-list emitted to socket:', socket.id)

          // ✅ socket room check করো
          const rooms = [...socket.rooms]
          console.log('🏠 socket rooms:', rooms)
          console.log('🏠 userId room joined:', rooms.includes(userId))

          callbackFn(callback, { success: true, data: chatList })
        } catch (err: any) {
          console.error('❌ my-chat-list error:', err.message)
          callbackFn(callback, { success: false, message: err.message })
        }
      })

      socket.join(userId)
      const rooms = [...socket.rooms]
      console.log('🏠 All rooms after join:', rooms)

      // =============================================
      // EVENT: send-message
      // =============================================
      socket.on('send-message', async (payload, callback) => {
        try {
          const { receiverId, text, imageUrl = [], bookingId } = payload // ← bookingId নেওয়া হলো

          console.log('📨 send-message received:', {
            receiverId,
            text,
            bookingId,
            userId,
          })

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

          // Validate receiver
          const receiverExists = await chatService.checkUserExists(receiverId)
          if (!receiverExists) {
            return callbackFn(callback, {
              success: false,
              message: 'Receiver not found',
            })
          }

          let chat

          // 🔥 Priority 1: bookingId দিয়ে চ্যাট খুঁজব (সবচেয়ে সঠিক)
          if (bookingId) {
            chat = await Chat.findOne({
              booking: bookingId,
              participants: { $all: [userId, receiverId] },
            })
            console.log('💬 Found chat by bookingId:', chat?._id || 'NOT FOUND')
          }

          // 🔥 Priority 2: যদি bookingId না থাকে বা না পাওয়া যায়, তাহলে participants দিয়ে খুঁজব
          if (!chat) {
            chat = await Chat.findOne({
              participants: { $all: [userId, receiverId] },
            })
            console.log(
              '💬 Found chat by participants:',
              chat?._id || 'NOT FOUND',
            )
          }

          // 🔥 Priority 3: যদি কোনো চ্যাট না পাওয়া যায়, তাহলে নতুন চ্যাট তৈরি করব
          if (!chat) {
            chat = await Chat.create({
              booking: bookingId || null, // bookingId থাকলে সেট করব
              participants: [userId, receiverId],
              status: CHAT_STATUS.accepted,
            })
            console.log('💬 New chat created:', chat._id)
          }

          // Create message
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

          // Emit new message to both users
          ioInstance!.to(userId).emit('new-message', populated)
          ioInstance!.to(receiverId).emit('new-message', populated)

          // Update chat list for both users
          const [senderChatList, receiverChatList] = await Promise.all([
            chatService.getMyChatList(userId, {}),
            chatService.getMyChatList(receiverId, {}),
          ])

          ioInstance!.to(userId).emit('chat-list', senderChatList)
          ioInstance!.to(receiverId).emit('chat-list', receiverChatList)

          // Unread count for receiver
          const unreadCount = await Message.countDocuments({
            receiver: receiverId,
            seen: false,
          })
          ioInstance!.to(receiverId).emit('new-notifications', unreadCount)

          callbackFn(callback, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Message sent successfully!',
            data: populated,
          })
        } catch (err: any) {
          console.error('❌ send-message error:', err.message)
          callbackFn(callback, { success: false, message: err.message })
        }
      })

      // =============================================
      // EVENT: seen
      // =============================================
      socket.on('seen', async ({ chatId }, callback) => {
        if (!chatId) {
          return callbackFn(callback, {
            success: false,
            message: 'chatId is required',
          })
        }

        try {
          const chat = await Chat.findById(chatId)
          if (!chat) {
            return callbackFn(callback, {
              success: false,
              message: 'Chat not found',
            })
          }

          // ✅ current user ছাড়া বাকিদের messages seen করো
          await Message.updateMany(
            {
              chat: chatId,
              seen: false,
              sender: { $ne: new Types.ObjectId(userId) },
            },
            { $set: { seen: true } },
          )

          // ✅ সব participants এর chat-list এবং unread update করো
          const participantIds = chat.participants.map((p) => p.toString())

          await Promise.all(
            participantIds.map(async (participantId) => {
              const [chatList, unreadCount] = await Promise.all([
                chatService.getMyChatList(participantId, {}),
                Message.countDocuments({
                  receiver: participantId,
                  seen: false,
                }),
              ])

              ioInstance!.to(participantId).emit('chat-list', chatList)
              ioInstance!
                .to(participantId)
                .emit('new-notifications', unreadCount)
            }),
          )

          callbackFn(callback, { success: true })
        } catch (err: any) {
          callbackFn(callback, { success: false, message: err.message })
        }
      })

      // =============================================
      // EVENT: typing
      // =============================================
      socket.on('typing', async ({ chatId }) => {
        if (!chatId) return

        try {
          const chat = await Chat.findById(chatId)
          if (!chat) return

          const otherUserId = chat.participants
            .find((p) => p.toString() !== userId)
            ?.toString()

          if (otherUserId) {
            ioInstance!.to(otherUserId).emit('typing', {
              userId,
              chatId,
              name: user?.firstName || 'User',
            })
          }
        } catch (err) {
          console.error('typing error:', err)
        }
      })

      // =============================================
      // EVENT: stopTyping
      // =============================================
      socket.on('stopTyping', async ({ chatId }) => {
        if (!chatId) return

        try {
          const chat = await Chat.findById(chatId)
          if (!chat) return

          const otherUserId = chat.participants
            .find((p) => p.toString() !== userId)
            ?.toString()

          if (otherUserId) {
            ioInstance!.to(otherUserId).emit('stop-typing', {
              userId,
              chatId,
            })
          }
        } catch (err) {
          console.error('stopTyping error:', err)
        }
      })

      // =============================================
      // EVENT: disconnect
      // =============================================
      socket.on('disconnect', () => {
        onlineUser.delete(userId)
        ioInstance!.emit('onlineUser', onlineUser.size)
        console.log('disconnect user:', socket.id)
      })
    } catch (err) {
      console.error('Connection error:', err)
      socket.disconnect()
    }
  })

  return ioInstance
}

export const getIO = (): Server => {
  if (!ioInstance) throw new Error('Socket.IO not initialized')
  return ioInstance
}

export default initializeSocketIO
