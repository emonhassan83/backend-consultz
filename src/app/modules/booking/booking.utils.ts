import moment from 'moment'
import { messages } from '../Notification/notification.constant'
import { modeType } from '../Notification/notification.interface'
import { NotificationService } from '../Notification/notification.service'
import { Session } from '../Session/session.model'
import { SessionSlots } from '../SessionSlots/sessionSlots.model'
import { TBookings } from './booking.interface'
import { WaitList } from '../WaitList/waitlist.model'

export const sendBookingsNotification = async (
  action: 'confirmed' | 'cancellation' | 'reschedule',
  booking: TBookings,
) => {
  const session = await Session.findById(booking?.session)
  const slot = await SessionSlots.findById(booking?.slot)

  const formatDate = (dateString: string) => {
    return moment(dateString).format('MMMM D, YYYY')
  }

  const formattedDate = session?.startDate
    ? formatDate(session?.startDate)
    : 'Unknown Date'

  // Define message and description based on type
  let message
  let description

  switch (action) {
    case 'confirmed':
      message = messages.bookingManagement.bookingConfirmed
      description = `You've successfully booked a ${session?.name} session on ${formattedDate} at ${slot?.startTime} at ${session?.location}.`
      break
    case 'cancellation':
      message = messages.bookingManagement.bookingCancelled
      description = `Your ${session?.name} session on ${formattedDate} at ${slot?.startTime} at ${session?.location} has been cancelled successfully.`
      break
    case 'reschedule':
      message = messages.bookingManagement.bookingRescheduled
      description = `Your ${session?.name} session on ${formattedDate} at ${slot?.startTime} at ${session?.location} has been rescheduled successfully.`
      break
    default:
      throw new Error('Invalid action type')
  }

  // Create a notification entry
  await NotificationService.createNotificationIntoDB({
    receiver: booking.user,
    message,
    description,
    // @ts-ignore
    reference: booking?._id,
    model_type: modeType.Booking,
  })
}

export const bookingsOnendNotifyToUsers = async (
  action: 'opened',
  booking: any,
) => {
  const session = await Session.findById(booking?.session)
  const slot = await SessionSlots.findById(booking?.slot)
  const waitlists = await WaitList.find({ session: session?._id }).select(
    'user',
  )
  const userIDs = waitlists.map((waitlist) => waitlist.user)

  const formatDate = (dateString: string) => {
    return moment(dateString).format('MMMM D, YYYY')
  }

  const formattedDate = session?.startDate
    ? formatDate(session?.startDate)
    : 'Unknown Date'

  // Define message and description based on type
  let message
  let description

  switch (action) {
    case 'opened':
      message = messages.bookingManagement.bookingOpened
      description = `A ${session?.name} session spot is now available for ${formattedDate} at ${slot?.startTime} session. You have to confirm before it's offered to the next user!`
      break
    default:
      throw new Error('Invalid action type')
  }

  // ✅ Send notifications to each waitlisted user
  await Promise.all(
    userIDs.map((userId) =>
      NotificationService.createNotificationIntoDB({
        receiver: userId,
        message,
        description,
        reference: booking?._id,
        model_type: modeType.Booking,
      }),
    ),
  )
}
