import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import httpStatus from 'http-status'
import { Types } from 'mongoose'
import getUserDetailsFromToken from './app/utils/vaildateUserFromToken'
import AppError from './app/errors/AppError'
import { callbackFn } from './app/utils/CallbackFn'
import { TUser } from './app/modules/user/user.interface'
import { User } from './app/modules/user/user.model'
import { Message } from './app/modules/messages/messages.models'
import { chatService } from './app/modules/chat/chat.service'
import { TChat } from './app/modules/chat/chat.interface'
import { Chat } from './app/modules/chat/chat.models'

const initializeSocketIO = (server: HttpServer) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
    },
  })

  // Online users
  const onlineUser = new Set()

  io.on('connection', async (socket) => {
    console.log('connected', socket?.id)

    try {
      //----------------------user token get from front end-------------------------//
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.token
      //----------------------check Token and return user details-------------------------//
      let user: any
      try {
        user = await getUserDetailsFromToken(token)
        if (!user) {
          throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid token')
        }
      } catch (error) {
        console.log(error)
        return
      }

      socket.join(user?._id?.toString())

      //----------------------user id set in online array-------------------------//
      onlineUser.add(user?._id?.toString())

      socket.on('check', (data, callback) => {
        console.log(data)

        callbackFn(callback, { success: true })
      })

      //----------------------online array send for front end------------------------//
      io.emit('onlineUser', Array.from(onlineUser))

      //----------------------user details and messages send for front end -->(as need to use)------------------------//
      socket.on('message-page', async (userId, callback) => {
        if (!userId) {
          callbackFn(callback, {
            success: false,
            message: 'userId is required',
          })
        }

        try {
          const receiverDetails: TUser | null = await User.findById(
            userId,
          ).select('_id email role image')

          if (!receiverDetails) {
            callbackFn(callback, {
              success: false,
              message: 'user is not found!',
            })
            io.emit('io-error', {
              success: false,
              message: 'user is not found!',
            })
          }
          const payload = {
            _id: receiverDetails?._id,
            email: receiverDetails?.email,
            image: receiverDetails?.photoUrl,
            role: receiverDetails?.role,
          }

          socket.emit('user-details', payload)

          const getPreMessage = await Message.find({
            $or: [
              { sender: user?._id, receiver: userId },
              { sender: userId, receiver: user?._id },
            ],
          }).sort({ updatedAt: 1 })

          socket.emit('message', getPreMessage || [])

          //end Notification//
        } catch (error: any) {
          callbackFn(callback, {
            success: false,
            message: error.message,
          })
          io.emit('io-error', { success: false, message: error })
          console.error('Error in message-page event:', error)
        }
      })

      //----------------------chat list------------------------//
      socket.on('my-chat-list', async (data, callback) => {
        try {
          const chatList = await chatService.getMyChatList(user?._id, {})
          const myChat = 'chat-list::' + user?._id

          io.emit(myChat, chatList)

          callbackFn(callback, { success: true, message: chatList })
        } catch (error: any) {
          callbackFn(callback, {
            success: false,
            message: error.message,
          })
          io.emit('io-error', { success: false, message: error.message })
        }
      })

      //----------------------seen message-----------------------//
      socket.on('seen', async ({ chatId }, callback) => {
        if (!chatId) {
          callbackFn(callback, {
            success: false,
            message: 'chatId id is required',
          })
          io.emit('io-error', {
            success: false,
            message: 'chatId id is required',
          })
        }

        try {
          const chatList: TChat | null = await Chat.findById(chatId)
          if (!chatList) {
            callbackFn(callback, {
              success: false,
              message: 'chat id is not valid',
            })
            io.emit('io-error', {
              success: false,
              message: 'chat id is not valid',
            })
            throw new AppError(httpStatus.BAD_REQUEST, 'chat id is not valid')
          }

          const messageIdList = await Message.aggregate([
            {
              $match: {
                chat: new Types.ObjectId(chatId),
                seen: false,
                sender: { $ne: new Types.ObjectId(user?._id) },
              },
            },
            { $group: { _id: null, ids: { $push: '$_id' } } },
            { $project: { _id: 0, ids: 1 } },
          ])
          const unseenMessageIdList =
            messageIdList.length > 0 ? messageIdList[0].ids : []

          const updateMessages = await Message.updateMany(
            { _id: { $in: unseenMessageIdList } },
            { $set: { seen: true } },
          )

          const user1 = chatList.participants[0]
          const user2 = chatList.participants[1]
          // //----------------------ChatList------------------------//
          const ChatListUser1 = await chatService.getMyChatList(
            user1.toString(),
            {}
          )

          const ChatListUser2 = await chatService.getMyChatList(
            user2.toString(),
            {}
          )

          const user1Chat = 'chat-list::' + user1

          const user2Chat = 'chat-list::' + user2

          const allUnReaddMessage = await Message.countDocuments({
            receiver: user1,
            seen: false,
          })
          const variable = 'new-notifications::' + user1
          io.emit(variable, allUnReaddMessage)

          const allUnReaddMessage2 = await Message.countDocuments({
            receiver: user2,
            seen: false,
          })
          const variable2 = 'new-notifications::' + user2
          io.emit(variable2, allUnReaddMessage2)

          const getPreMessage = await Message.find({
            $or: [
              { sender: user1, receiver: user2 },
              { sender: user2, receiver: user1 },
            ],
          }).sort({ updatedAt: 1 })

          socket.emit('message', getPreMessage || [])

          io.emit(user1Chat, ChatListUser1)
          io.emit(user2Chat, ChatListUser2)
        } catch (error: any) {
          callbackFn(callback, {
            success: false,
            message: error.message,
          })
          console.error('Error in seen event:', error)
          socket.emit('error', { message: error.message })
        }
      })

      // received message from frontend
      socket.on('send-message', async (payload, callback) => {
        payload.sender = user?._id

        const alreadyExists = await Chat.findOne({
          participants: { $all: [payload.sender, payload.receiver] },
        }).populate(['participants'])

        if (!alreadyExists) {
          const chatList = await Chat.create({
            participants: [payload.sender, payload.receiver],
          })

          payload.chat = chatList?._id
        } else {
          payload.chat = alreadyExists?._id
        }

        const result = await Message.create(payload)

        if (!result) {
          callbackFn(callback, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'Message sent failed',
          })
        }

        const senderMessage = 'new-message::' + result.chat.toString()

        io.emit(senderMessage, result)

        // //----------------------ChatList------------------------//
        const ChatListSender = await chatService.getMyChatList(
          result?.sender.toString(),
          {}
        )
        const senderChat = 'chat-list::' + result.sender.toString()
        io.emit(senderChat, ChatListSender)

        const ChatListReceiver = await chatService.getMyChatList(
          result?.receiver.toString(),
          {}
        )

        const receiverChat = 'chat-list::' + result.receiver.toString()

        io.emit(receiverChat, ChatListReceiver)

        // Notification
        const allUnReaddMessage = await Message.countDocuments({
          receiver: result.sender,
          seen: false,
        })
        const variable = 'new-notifications::' + result.sender
        io.emit(variable, allUnReaddMessage)
        const allUnReaddMessage2 = await Message.countDocuments({
          receiver: result.receiver,
          seen: false,
        })
        const variable2 = 'new-notifications::' + result.receiver
        io.emit(variable2, allUnReaddMessage2)

        //end Notification//
        callbackFn(callback, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Message sent successfully!',
          data: result,
        })
      })

      //-----------------------Typing------------------------//
      socket.on('typing', function (data) {
        const chat = 'typing::' + data.chatId.toString()
        const message = user?.name + ' is typing...'
        socket.emit(chat, { message: message })
      })
      socket.on('stopTyping', function (data) {
        const chat = 'stopTyping::' + data.chatId.toString()
        const message = user?.name + ' is stop typing...'
        socket.emit(chat, { message: message })
      })

      //-----------------------Seen All------------------------//
      socket.on('message-notification', async ({}, callback) => {
        try {
          const allUnReaddMessage = await Message.countDocuments({
            receiver: user?._id,
            seen: false,
          })
          const variable = 'new-notifications::' + user?._id
          io.emit(variable, allUnReaddMessage)
          callbackFn(callback, { success: true, message: allUnReaddMessage })
        } catch (error) {
          callbackFn(callback, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to retrieve notifications',
          })
        }
      })

      //-----------------------Disconnect------------------------//
      socket.on('disconnect', () => {
        onlineUser.delete(user?._id?.toString())
        io.emit('onlineUser', Array.from(onlineUser))
        console.log('disconnect user ', socket.id)
      })
    } catch (error) {
      console.error('-- socket.io connection error --', error)
    }
  })

  return io
}

export default initializeSocketIO
