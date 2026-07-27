import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { sendNotification } from '../../utils/sentNotification'
import { SESSION_TYPE } from './booking.constants'
import { Chat } from '../chat/chat.models'
import { Message } from '../messages/messages.models'
import mongoose from 'mongoose'
import { TUser } from '../user/user.interface'
import { TBookingSlots } from '../bookingSlots/bookingSlots.interface'

// Helper: booking IDs থেকে unread message count batch fetch
export const getUnreadMessageCountsBatch = async (
  bookingIds: string[],
  userId: string,
): Promise<Map<string, number>> => {
  if (!bookingIds.length) return new Map()

  // booking → chatId map
  const chats = await Chat.find({
    booking: { $in: bookingIds },
  })
    .select('_id booking')
    .lean()

  const chatIdToBookingId = new Map<string, string>()
  const chatIds: string[] = []

  for (const chat of chats) {
    const chatId = chat._id.toString()
    const bookingId = chat.booking.toString()
    chatIdToBookingId.set(chatId, bookingId)
    chatIds.push(chatId)
  }

  if (!chatIds.length) return new Map()

  // Unread messages: receiver = currentUser, seen = false
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        chat: { $in: chatIds.map((id) => new mongoose.Types.ObjectId(id)) },
        receiver: new mongoose.Types.ObjectId(userId),
        seen: false,
      },
    },
    {
      $group: {
        _id: '$chat',
        count: { $sum: 1 },
      },
    },
  ])

  const result = new Map<string, number>()
  for (const item of unreadCounts) {
    const bookingId = chatIdToBookingId.get(item._id.toString())
    if (bookingId) {
      result.set(bookingId, item.count)
    }
  }

  return result
}

// Helper: single booking unread count
export const getUnreadMessageCount = async (
  bookingId: string,
  userId: string,
): Promise<number> => {
  const map = await getUnreadMessageCountsBatch([bookingId], userId)
  return map.get(bookingId) ?? 0
}

export type TBookingNotifyAction =
  | 'pending'
  | 'pending_reminder'
  | 'confirmed'
  | 'declined'
  | 'cancellation'
  | 'not_responded'
  | 'reschedule'
  | 'schedule_change_request'
  | 'morning_reminder'
  | 'completed'
  | '10min_reminder'
  | 'dms_closing'
  | 'join_call'

// Helper to format session type nicely
const formatSessionType = (type: string) => {
  const formatted = {
    [SESSION_TYPE.introduction]: 'Introduction',
    [SESSION_TYPE.discussion]: 'Discussion',
    [SESSION_TYPE.deep_drive]: 'Deep Drive',
  }
  return (
    (formatted as Record<string, string>)[type] ||
    type.charAt(0).toUpperCase() + type.slice(1)
  )
}

const getEntityId = (entity: any): string =>
  (entity?._id || entity)?.toString()

export const sendBookingsNotification = async (
  action: TBookingNotifyAction,
  booking: any,
  user: TUser,
  expert: TUser,
  slot: TBookingSlots,
  extra?: {
    cancelledBy?: 'booker' | 'consult'
    otherPartyName?: string
    requesterName?: string
  },
) => {
  if (!user?.fcmToken) return

  const sessionTypeFormatted = formatSessionType(booking.sessionType)
  const sessionInfo = `${booking.localDate || slot?.date || 'N/A'} at ${booking.localTime || slot?.time || 'N/A'} (${booking.timezone || 'UTC'})`

  // Determine who is the "other party" (the person the receiver is interacting with)
  const isReceiverBooker = user._id.toString() === getEntityId(booking.user)
  const otherPartyName = extra?.otherPartyName || (isReceiverBooker
    ? expert?.firstName || 'your expert'
    : 'your client')

  let message = ''
  let description = ''

  switch (action) {
    case 'pending':
      message = messages.booking.request
      description = `${sessionTypeFormatted} session requested by ${extra?.requesterName || 'a client'} on ${sessionInfo}`
      break

    case 'pending_reminder':
      message = 'Booking Request Reminder'
      description = `Reminder: ${sessionTypeFormatted} session requested by ${extra?.requesterName || 'your client'} on ${sessionInfo}`
      break

    case 'confirmed':
      message = messages.booking.confirmed
      description = `${sessionTypeFormatted} session with ${expert.firstName} on ${sessionInfo}`
      break

    case 'declined':
      message = messages.booking.declined
      description = `${sessionTypeFormatted} session with ${otherPartyName} was declined.`
      break

    case 'cancellation':
      message = messages.booking.cancellation
      if (extra?.cancelledBy === 'booker') {
        description = `${sessionTypeFormatted} session on ${sessionInfo} was cancelled by the client.`
      } else if (extra?.cancelledBy === 'consult') {
        description = `${sessionTypeFormatted} session on ${sessionInfo} was cancelled by the consultant.`
      } else {
        description = `${sessionTypeFormatted} session with ${otherPartyName} on ${sessionInfo} was cancelled.`
      }
      break

    case 'not_responded':
      message = messages.booking.not_responded
      description = `Your confirmed booking on ${sessionInfo} was not completed and has been marked as not responded. A refund has been initiated.`;
      break

    case 'reschedule':
      message = messages.booking.rescheduled
      description = `${sessionTypeFormatted} session with ${otherPartyName} rescheduled to ${sessionInfo}`
      break

    case 'schedule_change_request':
      message = 'Schedule Change Requested'
      description = `${expert.firstName} requested you to reschedule your ${sessionTypeFormatted} session on ${sessionInfo}`
      break

    case 'morning_reminder':
      message = messages.booking.reminder
      description = `You have ${sessionTypeFormatted} session scheduled for today on ${sessionInfo}.`
      break

    case 'completed':
      message = messages.booking.complete
      description = `Your payment will be in your account soon Earnings`
      break

    case '10min_reminder':
      message = messages.bookingSchedule.reminder
      description = `Your ${sessionTypeFormatted} session with ${otherPartyName} starts at ${booking.localTime || slot?.time || 'N/A'} (${booking.timezone || 'UTC'})`
      break

    case 'dms_closing':
      message = messages.bookingSchedule.dms_closing
      description = `Your contract with ${otherPartyName} will ends in 1 hour`
      break

    case 'join_call':
      message = 'This Session is LIVE'
      description = `Your ${sessionTypeFormatted} session with ${otherPartyName} is live. Join the call immediately!`
      break

    default:
      throw new Error('Invalid booking notification action')
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: booking._id as string,
    modelType: modeType.Booking,
  }

  return await sendNotification([user.fcmToken], notifyPayload)
}
