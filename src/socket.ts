import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import httpStatus from 'http-status'
import { Types } from 'mongoose'
import getUserDetailsFromToken from './app/utils/vaildateUserFromToken'
import AppError from './app/errors/AppError'
import { callbackFn } from './app/utils/CallbackFn'
import { Message } from './app/modules/messages/messages.models'
import { chatService } from './app/modules/chat/chat.service'
import { Chat } from './app/modules/chat/chat.models'

const initializeSocketIO = (server: HttpServer) => {
  const io = new Server(server, {
    cors: { origin: '*' },
  })

  const onlineUser = new Set<string>()

  io.on('connection', async (socket) => {
    console.log('connected', socket?.id)

    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.token

      let user: any
      try {
        user = await getUserDetailsFromToken(token)
        if (!user) throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid token')
      } catch (error) {
        console.log(error)
        socket.disconnect()
        return
      }

      const userId = user?._id?.toString()

      // ✅ user এর নিজস্ব room এ join করো
      socket.join(userId)
      onlineUser.add(userId)
      io.emit('onlineUser', Array.from(onlineUser))

      // ✅ user এর সব chat room এ join করো
      const userChats = await Chat.find({ participants: userId }).select('_id')
      userChats.forEach((chat) => {
        socket.join(`chat:${chat._id.toString()}`)
      })

      // =============================================
      // EVENT: my-chat-list
      // =============================================
      socket.on('my-chat-list', async (_, callback) => {
        try {
          const chatList = await chatService.getMyChatList(userId, {})
          const eventName = `chat-list::${userId}`
          io.to(userId).emit(eventName, chatList)
          callbackFn(callback, { success: true, data: chatList })
        } catch (err: any) {
          callbackFn(callback, { success: false, message: err.message })
        }
      })

      // =============================================
      // EVENT: send-message
      // =============================================
      socket.on('send-message', async (payload, callback) => {
        try {
          const { receiverId, text, imageUrl = [] } = payload

          if (!receiverId || !text?.trim()) {
            return callbackFn(callback, {
              success: false,
              message: 'receiverId and text are required',
            })
          }

          // Chat find বা create করো
          let chat = await Chat.findOne({
            participants: { $all: [userId, receiverId] },
          })

          if (!chat) {
            chat = await Chat.create({
              participants: [userId, receiverId],
            })
            // নতুন chat room এ join করো
            socket.join(`chat:${chat._id.toString()}`)

            // receiver কে ও join করাও
            const receiverSockets = await io.in(receiverId).fetchSockets()
            receiverSockets.forEach((s) => {
              s.join(`chat:${chat!._id.toString()}`)
            })
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

          // ✅ শুধু ওই chat room এ emit করো
          io.to(`chat:${chat._id.toString()}`).emit(
            `new-message::${chat._id.toString()}`,
            populated,
          )

          // ✅ দুজনের chat list update করো
          const [senderChatList, receiverChatList] = await Promise.all([
            chatService.getMyChatList(userId, {}),
            chatService.getMyChatList(receiverId, {}),
          ])

          io.to(userId).emit(`chat-list::${userId}`, senderChatList)
          io.to(receiverId).emit(`chat-list::${receiverId}`, receiverChatList)

          // ✅ unread notification
          const unreadCount = await Message.countDocuments({
            receiver: receiverId,
            seen: false,
          })
          io.to(receiverId).emit(`new-notifications::${receiverId}`, unreadCount)

          callbackFn(callback, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Message sent successfully!',
            data: populated,
          })
        } catch (err: any) {
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

          // ✅ participants ObjectId array থেকে string এ convert করো
          const participantIds = chat.participants.map((p) => p.toString())

          for (const participantId of participantIds) {
            const chatList = await chatService.getMyChatList(participantId, {})
            io.to(participantId).emit(`chat-list::${participantId}`, chatList)

            const unreadCount = await Message.countDocuments({
              receiver: participantId,
              seen: false,
            })
            io.to(participantId).emit(
              `new-notifications::${participantId}`,
              unreadCount,
            )
          }

          // ✅ updated messages emit করো
          const messages = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .populate('sender', 'firstName lastName photoUrl _id')
            .populate('receiver', 'firstName lastName photoUrl _id')

          io.to(`chat:${chatId}`).emit(`message::${chatId}`, messages)

          callbackFn(callback, { success: true })
        } catch (err: any) {
          callbackFn(callback, { success: false, message: err.message })
        }
      })

      // =============================================
      // EVENT: typing / stopTyping
      // =============================================
      socket.on('typing', ({ chatId }) => {
        if (!chatId) return
        // ✅ socket.to() — নিজে ছাড়া বাকিদের emit করো
        socket.to(`chat:${chatId}`).emit(`typing::${chatId}`, {
          userId,
          name: user?.firstName || user?.name || 'User',
        })
      })

      socket.on('stopTyping', ({ chatId }) => {
        if (!chatId) return
        socket.to(`chat:${chatId}`).emit(`stopTyping::${chatId}`, { userId })
      })

      // =============================================
      // EVENT: message-notification
      // =============================================
      socket.on('message-notification', async (_, callback) => {
        try {
          const unreadCount = await Message.countDocuments({
            receiver: userId,
            seen: false,
          })
          io.to(userId).emit(`new-notifications::${userId}`, unreadCount)
          callbackFn(callback, { success: true, data: unreadCount })
        } catch (err: any) {
          callbackFn(callback, { success: false, message: err.message })
        }
      })

      // =============================================
      // EVENT: disconnect
      // =============================================
      socket.on('disconnect', () => {
        onlineUser.delete(userId)
        io.emit('onlineUser', Array.from(onlineUser))
        console.log('disconnect user', socket.id)
      })
    } catch (error) {
      console.error('socket.io connection error:', error)
      socket.disconnect()
    }
  })

  return io
}

export default initializeSocketIO
