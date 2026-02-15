import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { TBookings } from './booking.interface'
import { sendNotification } from '../../utils/sentNotification'

export const sendBookingsNotification = async (
  action: 'confirmed' | 'cancellation' | 'reschedule',
  booking: TBookings,
  user: any,
  slot: any
) => {
  if (!user?.fcmToken) return

  const sessionInfo = `${slot.date} at ${slot.time} (${booking.timezone})`
  
  let message = ''
  let description = ''

  switch (action) {
    case 'confirmed':
      message = messages.booking.confirmed
      // @ts-ignore
      description = description = `Your booking with ${booking.consult.firstName} on ${sessionInfo} has been confirmed.`;
      break

    case 'cancellation':
      message = messages.booking.cancellation
      description = `Your session scheduled for ${sessionInfo} has been cancelled. If this was unexpected, you may contact support for assistance.`
      break

    case 'reschedule':
      message = messages.booking.rescheduled
      description = `Your session has been rescheduled to ${sessionInfo}. Please review the updated schedule and prepare accordingly.`
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
