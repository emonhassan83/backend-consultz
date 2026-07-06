// utils/emailNotify.ts
import emailSender from './emailSender'
import { TUser } from '../modules/user/user.interface'
import { TBookings } from '../modules/booking/booking.interface'
import { TWithdraw } from '../modules/withdraw/withdraw.interface'
import { TWithdrawStatus } from '../modules/withdraw/withdraw.constant'
import {
  newBookingToConsultantTemplate,
  bookingCancelledToUserTemplate,
  bookingCancelledToConsultantTemplate,
  sessionCompletedToConsultantTemplate,
  bookingRescheduledToUserTemplate,
  bookingRescheduledToConsultantTemplate,
  sessionReminderTemplate,
  notRespondedToUserTemplate,
  notRespondedToConsultantTemplate,
  paymentSuccessToUserTemplate,
} from '../templates/booking.templates'
import {
  withdrawCompletedTemplate,
  withdrawStatusChangeTemplate,
} from '../templates/withdraw.templates'

// 1. New booking → consultant
export const sendNewBookingToConsultant = async (
  consult: TUser,
  booking: TBookings,
  user: TUser,
) => {
  if (!consult?.email) return
  await emailSender(
    consult.email,
    'New Booking Request Received',
    newBookingToConsultantTemplate(consult, booking, user),
  ).catch((err) => console.error(`New booking email failed (consult ${consult._id}):`, err))
}

// 2. Booking cancelled → user & consultant
export const sendCancellationEmail = async (
  user: TUser,
  consult: TUser,
  booking: TBookings,
  reason: string,
  cancelledBy: 'user' | 'consult',
): Promise<void> => {
  const cancelledByName =
    cancelledBy === 'user'
      ? `${user.firstName} ${user.lastName}`
      : `${consult.firstName} ${consult.lastName}`

  const tasks: Promise<void>[] = []

  if (user?.email && user.emailNotify?.booking) {
    tasks.push(
      emailSender(
        user.email,
        'Booking Cancelled',
        bookingCancelledToUserTemplate(user, consult, booking, reason, cancelledByName, cancelledBy === 'consult'),
      ).catch((err) => console.error(`Cancellation email failed (user ${user._id}):`, err)),
    )
  }

  if (consult?.email && consult.emailNotify?.booking) {
    tasks.push(
      emailSender(
        consult.email,
        'Booking Cancelled',
        bookingCancelledToConsultantTemplate(consult, user, booking, reason, cancelledByName),
      ).catch((err) => console.error(`Cancellation email failed (consult ${consult._id}):`, err)),
    )
  }

  await Promise.all(tasks)
}

// 3. Session completed → consultant
export const sendSessionCompletedToConsultant = async (
  consult: TUser,
  booking: TBookings,
  user: TUser,
  payment: any,
) => {
  if (!consult?.email) return
  await emailSender(
    consult.email,
    'Session Completed – Payment Processing',
    sessionCompletedToConsultantTemplate(consult, booking, user, payment),
  ).catch((err) => console.error(`Session completed email failed (consult ${consult._id}):`, err))
}

// 4. Booking rescheduled → user & consultant
export const sendRescheduleEmail = async (
  user: TUser,
  consult: TUser,
  booking: TBookings,
): Promise<void> => {
  const tasks: Promise<void>[] = []

  if (user?.email && user.emailNotify?.schedule) {
    tasks.push(
      emailSender(
        user.email,
        'Booking Rescheduled',
        bookingRescheduledToUserTemplate(user, consult, booking),
      ).catch((err) => console.error(`Reschedule email failed (user ${user._id}):`, err)),
    )
  }

  if (consult?.email && consult.emailNotify?.schedule) {
    tasks.push(
      emailSender(
        consult.email,
        'Booking Rescheduled',
        bookingRescheduledToConsultantTemplate(consult, user, booking),
      ).catch((err) => console.error(`Reschedule email failed (consult ${consult._id}):`, err)),
    )
  }

  await Promise.all(tasks)
}

// 5. Session reminder
export const createReminderEmailContent = (
  recipientName: string,
  otherName: string,
  sessionInfo: string,
  isJoinCall: boolean = false,
): string => sessionReminderTemplate(recipientName, otherName, sessionInfo, isJoinCall)

// 6. Withdrawal completed → consultant
export const sendWithdrawCompletedEmail = async (
  consultant: TUser,
  withdraw: TWithdraw,
  booking: TBookings,
  user: TUser,
) => {
  if (!consultant?.email) return
  await emailSender(
    consultant.email,
    'Withdrawal Completed – Funds Transferred',
    withdrawCompletedTemplate(consultant, withdraw, booking, user),
  ).catch((err) => console.error(`Withdraw completed email failed (consult ${consultant._id}):`, err))
}

// 7. Withdrawal status change → consultant
export const sendWithdrawStatusChangeEmail = async (
  consultant: TUser,
  withdraw: TWithdraw,
  newStatus: TWithdrawStatus,
) => {
  if (!consultant?.email || !consultant.emailNotify?.payment) return
  await emailSender(
    consultant.email,
    `Withdrawal Status Updated`,
    withdrawStatusChangeTemplate(consultant, withdraw, newStatus),
  ).catch((err) => console.error(`Withdraw status email failed (consult ${consultant._id}):`, err))
}

// 8. Payment success → user
export const sendPaymentSuccessToUser = async (
  user: TUser,
  booking: TBookings,
  expert: TUser,
  payment?: any,
) => {
  if (!user?.email || !user.emailNotify?.payment) return
  await emailSender(
    user.email,
    'Payment Successful – Booking Pending Approval',
    paymentSuccessToUserTemplate(user, booking, expert, payment),
  ).catch((err) => console.error(`Payment success email failed (user ${user._id}):`, err))
}

// 9. Not responded → user & consultant
export const sendNotRespondedEmail = async (
  user: TUser,
  consult: TUser,
  booking: TBookings,
  refundProcessed: boolean = false,
): Promise<void> => {
  const tasks: Promise<void>[] = []

  if (user?.email && user.emailNotify?.booking) {
    tasks.push(
      emailSender(
        user.email,
        'Your Booking Has Been Cancelled – Full Refund Initiated',
        notRespondedToUserTemplate(user, consult, booking, refundProcessed),
      ).catch((err) => console.error(`Not responded email failed (user ${user._id}):`, err)),
    )
  }

  if (consult?.email && consult.emailNotify?.booking) {
    tasks.push(
      emailSender(
        consult.email,
        'Booking Marked as Not Responded – Action Required',
        notRespondedToConsultantTemplate(consult, user, booking),
      ).catch((err) => console.error(`Not responded email failed (consult ${consult._id}):`, err)),
    )
  }

  await Promise.all(tasks)
}