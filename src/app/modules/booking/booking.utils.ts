import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { sendNotification } from '../../utils/sentNotification'
import { SESSION_TYPE } from './booking.constants';

// Helper to format session type nicely
const formatSessionType = (type: string) => {
  const formatted = {
    [SESSION_TYPE.introduction]: 'Introduction',
    [SESSION_TYPE.discussion]: 'Discussion',
    [SESSION_TYPE.deep_drive]: 'Deep Drive',
  };
  return (formatted as Record<string, string>)[type] || type.charAt(0).toUpperCase() + type.slice(1);
};

export const sendBookingsNotification = async (
  action: "pending" |'confirmed' | 'cancellation' | 'reschedule' | 'morning_reminder',
  booking: any,
  user: any,
  slot: any
) => {
  if (!user?.fcmToken) return

  const sessionTypeFormatted = formatSessionType(booking.sessionType);
  const sessionInfo = `${slot?.date || 'N/A'} at ${slot?.time || 'N/A'} (${booking.timezone || 'UTC'})`;
  
  let message = ''
  let description = ''

  switch (action) {
    case 'pending':
      message = messages.booking.request  
      description = `${sessionTypeFormatted} session requested with ${user.firstName} on ${sessionInfo}`;
      break

    case 'confirmed':
      message = messages.booking.confirmed
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} on ${sessionInfo}`;
      break

    case 'cancellation':
      message = messages.booking.cancellation
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} on ${sessionInfo} cancelled`
      break

    case 'reschedule':
      message = messages.booking.rescheduled
      description = `${sessionTypeFormatted} session with ${booking.consult.firstName} rescheduled to ${sessionInfo}`
      break

    case 'morning_reminder':
      message = messages.booking.reminder
      description = `You have ${sessionTypeFormatted} session scheduled for today on ${sessionInfo}.`
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
