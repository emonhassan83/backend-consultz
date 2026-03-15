import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { sendNotification } from '../../utils/sentNotification'
import { SESSION_TYPE } from './booking.constants'

export type TBookingNotifyAction =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'cancellation'
  | 'not_responded'
  | 'reschedule'
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

export const sendBookingsNotification = async (
  action: TBookingNotifyAction,
  booking: any,
  user: any,
  slot: any,
  extra?: { cancelledBy?: 'booker' | 'consult' },
) => {
  if (!user?.fcmToken) return

  const sessionTypeFormatted = formatSessionType(booking.sessionType)
  const sessionInfo = `${slot?.date || 'N/A'} at ${slot?.time || 'N/A'} (${booking.timezone || 'UTC'})`

  // Determine who is the "other party" (the person the receiver is interacting with)
  const isReceiverUser = user._id.toString() === booking.user?._id?.toString()
  const otherPartyName = isReceiverUser
    ? booking.consult?.firstName || 'your expert'
    : booking.user?.firstName || 'your client'

  let message = ''
  let description = ''

  switch (action) {
    case 'pending':
      message = messages.booking.request
      description = `${sessionTypeFormatted} session requested with ${booking.user.firstName} on ${sessionInfo}`
      break

    case 'confirmed':
      message = messages.booking.confirmed
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} on ${sessionInfo}`
      break

    case 'declined':
      message = messages.booking.declined
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} was declined.`
      break

    case 'cancellation':
      message = messages.booking.cancellation
      if (extra?.cancelledBy === 'booker') {
        description = `${sessionTypeFormatted} session on ${sessionInfo} was cancelled by consult.`
      } else if (extra?.cancelledBy === 'consult') {
        description = `${sessionTypeFormatted} session on ${sessionInfo} was cancelled by user.`
      } else {
        description = `${sessionTypeFormatted} session with ${booking.consult.firstName} on ${sessionInfo} cancelled`
      }
      break

    case 'not_responded':
      message = messages.booking.not_responded
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} was not completed.`
      break

    case 'reschedule':
      message = messages.booking.rescheduled
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} rescheduled to ${sessionInfo}`
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
      description = `Your ${sessionTypeFormatted} session with ${otherPartyName} starts at ${slot?.time || 'N/A'}`
      break

    case 'dms_closing':
      message = messages.bookingSchedule.dms_closing
      description = `Your contract with ${otherPartyName} will ends in 1 hour`
      break

    case 'join_call':
      message = messages.bookingSchedule.join_call
      description = `Your ${sessionTypeFormatted} session with ${otherPartyName} is starting now`
      break

    default:
      throw new Error('Invalid booking notification action')
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: booking._id as string,
    model_type: modeType.Booking,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}
