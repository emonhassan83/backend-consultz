import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import httpStatus from 'http-status'
import { Types } from 'mongoose'
import getUserDetailsFromToken from './app/utils/vaildateUserFromToken'
import AppError from './app/errors/AppError'
import { callbackFn } from './app/utils/CallbackFn'
import { Chat } from './app/modules/chat/chat.models'
import { Message } from './app/modules/messages/messages.models'
import { chatService } from './app/modules/chat/chat.service'

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
          const { receiverId, text, imageUrl = [] } = payload

          console.log('📨 send-message received:', { receiverId, text, userId })

          if (!receiverId || !text?.trim()) {
            return callbackFn(callback, {
              success: false,
              message: 'receiverId and text are required',
            })
          }

          const receiverExists = await chatService.checkUserExists(receiverId)
          console.log('👤 receiver exists:', receiverExists)

          if (!receiverExists) {
            return callbackFn(callback, {
              success: false,
              message: 'Receiver not found',
            })
          }

          let chat = await Chat.findOne({
            participants: { $all: [userId, receiverId] },
          })
          console.log(
            '💬 existing chat:',
            chat?._id || 'NOT FOUND — will create',
          )

          if (!chat) {
            chat = await Chat.create({
              participants: [userId, receiverId],
            })
            console.log('💬 new chat created:', chat._id)
          }

          const message = await Message.create({
            chat: chat._id,
            sender: userId,
            receiver: receiverId,
            text,
            imageUrl,
          })
          console.log('✅ message created:', message._id)

          const populated = await Message.findById(message._id)
            .populate('sender', 'firstName lastName photoUrl _id')
            .populate('receiver', 'firstName lastName photoUrl _id')

          // ✅ room check করো
          const senderRoom = ioInstance!.sockets.adapter.rooms.get(userId)
          const receiverRoom = ioInstance!.sockets.adapter.rooms.get(receiverId)
          console.log(`🏠 sender room (${userId}):`, senderRoom?.size || 0)
          console.log(
            `🏠 receiver room (${receiverId}):`,
            receiverRoom?.size || 0,
          )

          ioInstance!.to(userId).emit('new-message', populated)
          ioInstance!.to(receiverId).emit('new-message', populated)
          console.log('📤 new-message emitted to both users')

          const [senderChatList, receiverChatList] = await Promise.all([
            chatService.getMyChatList(userId, {}),
            chatService.getMyChatList(receiverId, {}),
          ])

          ioInstance!.to(userId).emit('chat-list', senderChatList)
          ioInstance!.to(receiverId).emit('chat-list', receiverChatList)
          console.log('📋 chat-list emitted to both users')

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
