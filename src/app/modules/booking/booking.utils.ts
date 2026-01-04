import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { TBookings } from './booking.interface'
import { sendNotification } from '../../utils/sentNotification'

export const sendBookingsNotification = async (
  action: 'confirmed' | 'cancellation' | 'reschedule',
  booking: TBookings,
  user: any,
) => {
  if (!user?.fcmToken) return

  const sessionInfo = `${booking.sessionDate} at ${booking.sessionTime} (${booking.timezone})`

  let message = ''
  let description = ''

  switch (action) {
    case 'confirmed':
      message = messages.booking.confirmed
      description = `Your session has been confirmed for ${sessionInfo}. Please be available on time to get the most out of your consultation.`
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
