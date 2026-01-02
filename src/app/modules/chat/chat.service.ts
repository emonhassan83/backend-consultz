import httpStatus from 'http-status'
import { deleteFromS3 } from '../../utils/s3'
import { TChat } from './chat.interface'
import AppError from '../../errors/AppError'
import { Chat } from './chat.models'
import { User } from '../user/user.model'
import { Message } from '../messages/messages.models'

// Create chat
const createChat = async (payload: TChat) => {
  const user1 = await User.findById(payload?.participants[0])

  if (!user1) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid user')
  }

  const user2 = await User.findById(payload?.participants[1])

  if (!user2) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid user')
  }

  const alreadyExists = await Chat.findOne({
    participants: { $all: payload.participants },
  }).populate(['participants'])

  if (alreadyExists) {
    return alreadyExists
  }

  const result = Chat.create(payload)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat creation failed')
  }
  return result
}

// Get my chat list
const getMyChatList = async (userId: string, query: Record<string, unknown>) => {
  const searchTerm = query.searchTerm as string | undefined

  const chats = await Chat.find({
    participants: userId,
  }).populate({
    path: 'participants',
    select: 'firstName lastName photoUrl',
    match: { _id: { $ne: userId } },
  })

  if (!chats) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat list not found')
  }

  const data = []

  for (const chatItem of chats) {
    const participant = chatItem?.participants?.[0]
    if (!participant || typeof participant !== 'object' || !('name' in participant)) continue

    // Apply name-based search
    if (searchTerm) {
      const name = ((participant as any)?.name || '').toLowerCase()
      if (!name.includes(searchTerm.toLowerCase())) continue
    }

    const chatId = chatItem?._id

    const message = await Message.findOne({ chat: chatId }).sort({
      updatedAt: -1,
    })

    const unreadMessageCount = message
      ? await Message.countDocuments({
          chat: chatId,
          seen: false,
          sender: { $ne: userId },
        })
      : 0

    data.push({ chat: chatItem, message: message || null, unreadMessageCount })
  }

  // Sort by latest message
  data.sort((a, b) => {
    const dateA = a.message && a.message.createdAt instanceof Date ? a.message.createdAt.getTime() : (a.message && typeof a.message.createdAt === 'number' ? a.message.createdAt : 0)
    const dateB = b.message && b.message.createdAt instanceof Date ? b.message.createdAt.getTime() : (b.message && typeof b.message.createdAt === 'number' ? b.message.createdAt : 0)
    return dateB - dateA
  })

  return data
}

// Get chat by ID
const getChatById = async (id: string) => {
  const result = await Chat.findById(id).populate({
    path: 'participants',
    select: 'firstName lastName photoUrl',
  })

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat not found')
  }
  return result
}

// Get chat by user ID
const getChatByUserId = async (currentUser: string, userId: string) => {
  const chats = await Chat.find({
    participants: { $all: [currentUser, userId] },
  }).populate({
    path: 'participants',
    select: 'firstName lastName photoUrl',
    match: { _id: { $ne: currentUser } },
  });

  if (!chats) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat list not found');
  }

  const data = [];

  for (const chatItem of chats) {
    const participant = chatItem?.participants?.[0];
    if (!participant || typeof participant !== 'object' || !('name' in participant)) continue;

    const chatId = chatItem?._id;

    const message = await Message.findOne({ chat: chatId }).sort({
      updatedAt: -1,
    });

    const unreadMessageCount = message
      ? await Message.countDocuments({
          chat: chatId,
          seen: false,
          sender: { $ne: currentUser },
        })
      : 0;

    data.push({ chat: chatItem, message: message || null, unreadMessageCount });
  }

  data.sort((a, b) => {
    const dateA =
      a.message && a.message.createdAt
        ? a.message.createdAt instanceof Date
          ? a.message.createdAt.getTime()
          : typeof a.message.createdAt === 'number'
          ? a.message.createdAt
          : 0
        : 0;
    const dateB =
      b.message && b.message.createdAt
        ? b.message.createdAt instanceof Date
          ? b.message.createdAt.getTime()
          : typeof b.message.createdAt === 'number'
          ? b.message.createdAt
          : 0
        : 0;
    return dateB - dateA;
  });

  return data;
};


// Update chat list
const updateChatList = async (id: string, payload: Partial<TChat>) => {
  const result = await Chat.findByIdAndUpdate(id, payload, { new: true })
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat not found')
  }
  return result
}

// Delete chat list
const deleteChatList = async (id: string) => {
  await deleteFromS3(`images/messages/${id}`)
  const result = await Chat.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat not found')
  }
  return result
}

export const chatService = {
  createChat,
  getMyChatList,
  getChatById,
  getChatByUserId,
  updateChatList,
  deleteChatList,
}
