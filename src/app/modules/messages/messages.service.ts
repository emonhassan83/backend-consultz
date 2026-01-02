import httpStatus from 'http-status'
import QueryBuilder from '../../builder/QueryBuilder'
import { deleteFromS3 } from '../../utils/s3'
import { TMessages } from './messages.interface'
import { Chat } from '../chat/chat.models'
import { Message } from './messages.models'
import AppError from '../../errors/AppError'
import { chatService } from '../chat/chat.service'
import { io } from '../../../server'
import mongoose from 'mongoose'

const createMessages = async (payload: TMessages) => {
  const alreadyExists = await Chat.findOne({
    participants: { $all: [payload.sender, payload.receiver] },
  }).populate(['participants'])

  if (!alreadyExists) {
    const chatList = await Chat.create({
      participants: [payload.sender, payload.receiver],
    })
    //@ts-ignore
    payload.chat = chatList?._id
  } else {
    //@ts-ignore
    payload.chat = alreadyExists?._id
  }

  const result = await Message.create(payload)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Message creation failed')
  }

  if (io) {
    const senderMessage = 'new-message::' + result.chat.toString()

    io.emit(senderMessage, result)

    // //----------------------ChatList------------------------//
    const ChatListSender = await chatService.getMyChatList(
      result?.sender.toString(),
      {}
    )
    const ChatListReceiver = await chatService.getMyChatList(
      result?.receiver.toString(),
      {}
    )

    const senderChat = 'chat-list::' + result.sender.toString()
    const receiverChat = 'chat-list::' + result.receiver.toString()
    io.emit(receiverChat, ChatListSender)
    io.emit(senderChat, ChatListReceiver)
  }

  return result
}

// Get all messages
const getAllMessages = async (query: Record<string, any>) => {
  const MessageModel = new QueryBuilder(
    Message.find().populate([
      {
        path: 'sender',
        select: 'name email photoUrl _id contactNumber',
      },
      {
        path: 'receiver',
        select: 'name email photoUrl _id contactNumber',
      },
    ]),
    query,
  )
    .filter()
    // .paginate()
    .sort()
    .fields()

  const data = await MessageModel.modelQuery
  const meta = await MessageModel.countTotal()
  return {
    data,
    meta,
  }
}

// Update messages
const updateMessages = async (id: string, payload: Partial<TMessages>) => {
  const result = await Message.findByIdAndUpdate(id, payload, { new: true })
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Message update failed')
  }
  return result
}

// Get messages by chat ID
const getMessagesByChatId = async (chatId: string) => {
  const result = await Message.find({ chat: chatId }).sort({ createdAt: 1 }).populate([
    {
      path: 'sender',
      select: 'name email photoUrl _id',
    },
    {
      path: 'receiver',
      select: 'name email photoUrl _id',
    },
  ])
  return result
}

// Get message by ID
const getMessagesById = async (id: string) => {
  const result = await Message.findById(id).populate([
    {
      path: 'sender',
      select: 'name email photoUrl _id',
    },
    {
      path: 'receiver',
      select: 'name email photoUrl _id',
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Oops! Message not found')
  }
  return result
}

const deleteMessages = async (id: string) => {
  const message = await Message.findById(id)
  if (!message) {
    throw new AppError(httpStatus.NOT_FOUND, 'Oops! Message not found')
  }
  if (message?.imageUrl) {
    await deleteFromS3(
      `images/messages/${message?.chat.toString()}/${message?.id}`,
    )
  }

  const result = await Message.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Oops! Message not found')
  }
  return result
}

const seenMessage = async (userId: string, chatId: string) => {
  const messageIdList = await Message.aggregate([
    {
      $match: {
        chat: new mongoose.Types.ObjectId(chatId),
        seen: false,
        sender: { $ne: new mongoose.Types.ObjectId(userId) },
      },
    },
    { $group: { _id: null, ids: { $push: '$_id' } } },
    { $project: { _id: 0, ids: 1 } },
  ])

  const unseenMessageIdList =
    messageIdList.length > 0 ? messageIdList[0].ids : []

  if (unseenMessageIdList.length === 0) {
    console.log('No unseen messages found')
    return { message: 'No messages to update' }
  }

  const updateMessages = await Message.updateMany(
    { _id: { $in: unseenMessageIdList } },
    { $set: { seen: true } },
  )

  return updateMessages
}

const deleteMessagesByChatId = async (chatId: string) => {
 const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Delete all messages for the chat
    const messageDeleteResult = await Message.deleteMany({ chat: chatId }).session(session);
    
    if (messageDeleteResult.deletedCount === 0) {
      throw new AppError(httpStatus.NOT_FOUND, 'No messages found for this chat');
    }

    // // Delete the chat itself
    // const chatDeleteResult = await Chat.findByIdAndDelete(chatId).session(session);
    
    // if (!chatDeleteResult) {
    //   throw new AppError(httpStatus.NOT_FOUND, 'Chat not found');
    // }

    await session.commitTransaction();
    session.endSession();

    return messageDeleteResult
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}

export const messagesService = {
  createMessages,
  getMessagesByChatId,
  getMessagesById,
  updateMessages,
  getAllMessages,
  deleteMessages,
  seenMessage,
  deleteMessagesByChatId
}
