import httpStatus from 'http-status'
import { deleteFromS3 } from '../../utils/s3'
import { TChat } from './chat.interface'
import AppError from '../../errors/AppError'
import { Chat } from './chat.models'
import { User } from '../user/user.model'
import { Message } from '../messages/messages.models'
import { Booking } from '../booking/booking.models'
import { BOOKING_STATUS } from '../booking/booking.constants'

const createChat = async (payload: TChat) => {
  const { participants, booking: bookingId } = payload
  if (!participants || participants.length !== 2) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Exactly two participants are required to create a chat',
    )
  }
  if (!bookingId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Booking is required to create a chat',
    )
  }

  const booking = await Booking.findById(bookingId)
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  if (booking.status !== BOOKING_STATUS.confirmed) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Only confirmed bookings can have chats',
    )
  }

  const bookingExists = await Chat.findOne({ booking: bookingId })
  if (bookingExists) {
    return bookingExists
  }

  const [user1, user2] = await Promise.all([
    User.findById(payload?.participants[0]),
    User.findById(payload?.participants[1]),
  ])

  if (!user1) throw new AppError(httpStatus.NOT_FOUND, 'User 1 not found')
  if (!user2) throw new AppError(httpStatus.NOT_FOUND, 'User 2 not found')

  const alreadyExists = await Chat.findOne({
    participants: { $all: payload.participants },
  }).populate('participants')

  if (alreadyExists) return alreadyExists

  const result = await Chat.create(payload)
  if (!result)
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat creation failed')
  return result
}

const getMyChatList = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const searchTerm = query.searchTerm as string | undefined

  const chats = await Chat.find({
    participants: userId,
  })
    .populate({
      path: 'participants',
      select: 'firstName lastName photoUrl',
      match: { _id: { $ne: userId } },
    })
    .select('_id participants status')

  if (!chats) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Chat list not found')
  }

  // ✅ Promise.all দিয়ে parallel query করো
  const dataWithMessages = await Promise.all(
    chats.map(async (chatItem) => {
      const participant = chatItem?.participants?.[0] as any

      // ✅ 'name' in participant check বাদ
      if (!participant || typeof participant !== 'object') return null

      // Search filter
      if (searchTerm) {
        const fullName =
          `${participant?.firstName || ''} ${participant?.lastName || ''}`.toLowerCase()
        if (!fullName.includes(searchTerm.toLowerCase())) return null
      }

      const chatId = chatItem?._id

      const [message, unreadMessageCount] = await Promise.all([
        Message.findOne({ chat: chatId })
          .sort({ createdAt: -1 })
          .select('text imageUrl seen sender createdAt')
          .populate([
            { path: 'sender', select: 'firstName lastName photoUrl' },
          ]),
        Message.countDocuments({
          chat: chatId,
          seen: false,
          sender: { $ne: userId },
        }),
      ])

      return {
        chat: chatItem,
        lastMessage: message || null,
        unreadMessageCount,
      }
    }),
  )

  // null filter করো
  const data = dataWithMessages.filter(Boolean) as any[]

  // Latest message এর based এ sort করো
  data.sort((a, b) => {
    const dateA = a.message?.createdAt
      ? new Date(a.message.createdAt).getTime()
      : 0
    const dateB = b.message?.createdAt
      ? new Date(b.message.createdAt).getTime()
      : 0
    return dateB - dateA
  })

  return data
}

const getChatBookingById = async (bookingId: string) => {
  const result = await Chat.findOne({ booking: bookingId }).populate({
    path: 'participants',
    select: 'firstName lastName photoUrl',
  })
  if (!result) throw new AppError(httpStatus.BAD_REQUEST, 'Chat not found')
  return result
}

const getChatByUserId = async (currentUser: string, userId: string) => {
  const chats = await Chat.find({
    participants: { $all: [currentUser, userId] },
  }).populate({
    path: 'participants',
    select: 'firstName lastName photoUrl',
    match: { _id: { $ne: currentUser } },
  })

  if (!chats) throw new AppError(httpStatus.BAD_REQUEST, 'Chat list not found')

  const dataWithMessages = await Promise.all(
    chats.map(async (chatItem) => {
      const participant = chatItem?.participants?.[0] as any

      // ✅ fix — 'name' in participant check বাদ
      if (!participant || typeof participant !== 'object') return null

      const chatId = chatItem?._id

      const [message, unreadMessageCount] = await Promise.all([
        Message.findOne({ chat: chatId }).sort({ createdAt: -1 }),
        Message.countDocuments({
          chat: chatId,
          seen: false,
          sender: { $ne: currentUser },
        }),
      ])

      return { chat: chatItem, message: message || null, unreadMessageCount }
    }),
  )

  const data = dataWithMessages.filter(Boolean) as any[]

  data.sort((a, b) => {
    const dateA = a.message?.createdAt
      ? new Date(a.message.createdAt).getTime()
      : 0
    const dateB = b.message?.createdAt
      ? new Date(b.message.createdAt).getTime()
      : 0
    return dateB - dateA
  })

  return data
}

const updateChatList = async (id: string, payload: Partial<TChat>) => {
  const result = await Chat.findByIdAndUpdate(id, payload, { new: true })
  if (!result) throw new AppError(httpStatus.BAD_REQUEST, 'Chat not found')
  return result
}

const deleteChatList = async (id: string) => {
  await deleteFromS3(`images/messages/${id}`)
  const result = await Chat.findByIdAndDelete(id)
  if (!result) throw new AppError(httpStatus.BAD_REQUEST, 'Chat not found')
  return result
}

const checkUserExists = async (userId: string) => {
  const user = await User.findById(userId).select('_id')
  return !!user
}

export const chatService = {
  createChat,
  getMyChatList,
  getChatBookingById,
  getChatByUserId,
  updateChatList,
  deleteChatList,
  checkUserExists,
}
