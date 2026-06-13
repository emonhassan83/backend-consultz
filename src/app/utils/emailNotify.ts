import emailSender from './emailSender'
import { TUser } from '../modules/user/user.interface'
import { TBookingSlots } from '../modules/bookingSlots/bookingSlots.interface'
import { TBookings } from '../modules/booking/booking.interface'
import { TWithdraw } from '../modules/withdraw/withdraw.interface'
import { TWithdrawStatus } from '../modules/withdraw/withdraw.constant'

// 1. Send confirmation email for consult
export const sendNewBookingToConsultant = async (
  consult: TUser,
  booking: TBookings,
  user: TUser,
) => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  await emailSender(
    consult.email,
    'New Booking Confirmed! 🎉',
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #333;">New Booking Confirmed! 🎉</h2>
        <p style="color: #555;">Dear ${consult.firstName},</p>
        <p style="color: #555;">You have a new confirmed booking:</p>
        <ul style="color: #555; line-height: 1.6;">
          <li><strong>User:</strong> ${user.firstName} ${user.lastName}</li>
          <li><strong>Session Type:</strong> ${booking.sessionType}</li>
          <li><strong>Date & Time:</strong> ${sessionInfo}</li>
          <li><strong>Amount:</strong> $${booking.price}</li>
        </ul>
        <p style="color: #555;">Please be prepared for the session. Check your dashboard for more details.</p>
        <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
          <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
        </div>
      </div>
    `,
  )
}

// 2. Booking cancel email for user & consult
export const sendCancellationEmail = async (
  user: TUser,
  consult: TUser,
  booking: TBookings,
  reason: string,
  cancelledBy: 'user' | 'consult',
): Promise<void> => {
  // Format session info once
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`
  const cancelledByName =
    cancelledBy === 'user'
      ? `${user.firstName} ${user.lastName}`
      : `${consult.firstName} ${consult.lastName}`

  // Reusable email template factory
  const createEmailContent = (
    recipientName: string,
    otherPartyName: string,
    extraMessage: string,
  ) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #d9534f;">Booking Cancelled</h2>
      <p style="color: #555;">Dear ${recipientName},</p>
      <p style="color: #555;">
       <strong>Reason: </strong>${reason}.
      </p>
      <p style="color: #555;">
        Your booking with ${otherPartyName} on <strong>${sessionInfo}</strong> 
        has been cancelled by ${cancelledByName}.
      </p>
      ${extraMessage}
      <p style="color: #555;">If this was unexpected, please contact support.</p>
      <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
        <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
      </div>
    </div>
  `

  const userExtra =
    cancelledBy === 'user'
      ? '<p style="color: #d9534f; font-weight: bold;">Your refund is being processed as soon as possible. It will reflect in your account shortly.</p>'
      : ''

  const userEmailContent = createEmailContent(
    user.firstName,
    `${consult.firstName} ${consult.lastName}`,
    userExtra,
  )

  const consultEmailContent = createEmailContent(
    consult.firstName,
    `${user.firstName} ${user.lastName}`,
    '',
  )

  // Prepare email sending tasks (only if conditions are met)
  const emailTasks: Promise<void>[] = []

  if (user?.email && user.emailNotify?.booking) {
    emailTasks.push(
      emailSender(user.email, 'Booking Cancelled', userEmailContent).catch(
        (err) =>
          console.error(
            `Failed to send cancellation email to user ${user._id}:`,
            err,
          ),
      ),
    )
  }

  if (consult?.email && consult.emailNotify?.booking) {
    emailTasks.push(
      emailSender(
        consult.email,
        'Booking Cancelled',
        consultEmailContent,
      ).catch((err) =>
        console.error(
          `Failed to send cancellation email to consultant ${consult._id}:`,
          err,
        ),
      ),
    )
  }

  // Send all emails in parallel (non-blocking)
  await Promise.all(emailTasks)
}

// 3. booking complete email for consult
export const sendSessionCompletedToConsultant = async (
  consult: TUser,
  booking: TBookings,
  user: TUser,
  consultAmount: number,
) => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`
  await emailSender(
    consult.email,
    'Session Completed – Payment Processing',
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #5cb85c;">Session Completed</h2>
        <p style="color: #555;">Dear ${consult.firstName},</p>
        <p style="color: #555;">Your session with ${user.firstName} ${user.lastName} on ${sessionInfo} is now complete.</p>
        <p style="color: #555;">Payment of $${consultAmount} is being processed and will be transferred to your account soon.</p>
        <p style="color: #555;">Thank you for your service!</p>
        <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
          <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
        </div>
      </div>
    `,
  )
}

// 4. Reschedule email sent for user & consult
export const sendRescheduleEmail = async (
  user: TUser,
  consult: TUser,
  booking: TBookings,
): Promise<void> => {
  // Format session info consistently
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  // Common email styling (reused for both)
  const baseEmailTemplate = (
    recipientName: string,
    otherName: string,
    actionText: string,
  ) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #f0ad4e;">Booking Rescheduled</h2>
      <p style="color: #555;">Dear ${recipientName},</p>
      <p style="color: #555;">Your booking with ${otherName} has been rescheduled to:</p>
      <p style="color: #555; font-weight: bold; margin: 16px 0;">${sessionInfo}</p>
      <p style="color: #555;">${actionText}</p>
      <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
        <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
      </div>
    </div>
  `

  const userEmailContent = baseEmailTemplate(
    user.firstName,
    `${consult.firstName} ${consult.lastName}`,
    'Please make sure to be available at the new time.',
  )

  const consultEmailContent = baseEmailTemplate(
    consult.firstName,
    `${user.firstName} ${user.lastName}`,
    'Please update your schedule accordingly.',
  )

  // Send emails only if notifications are enabled
  const emailPromises: Promise<void>[] = []

  if (user?.email && user.emailNotify?.schedule) {
    emailPromises.push(
      emailSender(user.email, 'Booking Rescheduled', userEmailContent).catch(
        (err) =>
          console.error(
            `Failed to send reschedule email to user ${user._id}:`,
            err,
          ),
      ),
    )
  }

  if (consult?.email && consult.emailNotify?.schedule) {
    emailPromises.push(
      emailSender(
        consult.email,
        'Booking Rescheduled',
        consultEmailContent,
      ).catch((err) =>
        console.error(
          `Failed to send reschedule email to consultant ${consult._id}:`,
          err,
        ),
      ),
    )
  }

  // Wait for all emails to finish (parallel)
  await Promise.all(emailPromises)
}

// 5. Reusable email template for time-sensitive reminders
export const createReminderEmailContent = (
  recipientName: string,
  otherName: string,
  sessionInfo: string,
  isJoinCall: boolean = false,
) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <h2 style="color: #555;">${isJoinCall ? 'Join the Call Now' : 'Session Starting Soon'}</h2>
    <p style="color: #555;">Dear ${recipientName},</p>
    <p style="color: #555;">
      ${
        isJoinCall
          ? 'Your session is starting now!'
          : 'Your session is starting in 10 minutes.'
      }
    </p>
    <ul style="color: #555; line-height: 1.6;">
      <li><strong>With:</strong> ${otherName}</li>
      <li><strong>Date & Time:</strong> ${sessionInfo}</li>
    </ul>
    <p style="color: #555;">Please be ready and check your dashboard.</p>
    <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
      <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
    </div>
  </div>
`

// Reusable base email template
const baseEmailTemplate = (
  title: string,
  greetingName: string,
  content: string,
  ctaText?: string,
  ctaLink?: string,
) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <h2 style="color: #333;">${title}</h2>
    <p style="color: #555;">Dear ${greetingName},</p>
    ${content}
    ${
      ctaText && ctaLink
        ? `
      <p style="text-align: center; margin: 30px 0;">
        <a href="${ctaLink}" style="background: #0275d8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          ${ctaText}
        </a>
      </p>
    `
        : ''
    }
    <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
      <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
    </div>
  </div>
`

// 6. When withdraw is completed → email to consultant
export const sendWithdrawCompletedEmail = async (
  consultant: TUser,
  withdraw: TWithdraw,
  booking: TBookings,
  user: TUser,
) => {
  if (!consultant?.email || !consultant.emailNotify?.payment) return

  const sessionInfo = booking
    ? `${booking.localDate} • ${booking.localTime} (${booking.timezone})`
    : 'N/A'

  const content = `
    <p style="color: #555;">Great news! Your withdrawal request has been successfully processed.</p>
    <ul style="color: #555; line-height: 1.6;">
      <li><strong>Amount:</strong> $${withdraw.amount.toFixed(2)}</li>
      ${
        booking
          ? `
        <li><strong>From Booking:</strong> ${booking.sessionType} with ${user.firstName} ${user.lastName}</li>
        <li><strong>Session Date:</strong> ${sessionInfo}</li>
      `
          : ''
      }
      <li><strong>Status:</strong> Completed</li>
    </ul>
    <p style="color: #555;">The funds should now be available in your connected account.</p>
    <p style="color: #555;">Please open the Consultz app and check your Earnings section for full details.</p>
    <p style="color: #555;">Thank you for being part of Consultz!</p>
  `

  await emailSender(
    consultant.email,
    'Withdrawal Completed – Funds Transferred',
    baseEmailTemplate('Withdrawal Completed', consultant.firstName, content),
  )
}

// 7. When withdraw status changes → email to consultant
export const sendWithdrawStatusChangeEmail = async (
  consultant: TUser,
  withdraw: TWithdraw,
  newStatus: TWithdrawStatus,
) => {
  if (!consultant?.email || !consultant.emailNotify?.payment) return

  const statusText =
    newStatus === 'completed'
      ? 'Completed'
      : newStatus === 'proceed'
        ? 'Proceed'
        : newStatus === 'hold'
          ? 'Hold'
          : newStatus

  const content = `
    <p style="color: #555;">Your withdrawal request status has been updated:</p>
    <ul style="color: #555; line-height: 1.6;">
      <li><strong>Amount:</strong> $${withdraw.amount.toFixed(2)}</li>
      <li><strong>Current Status:</strong> ${statusText}</li>
    </ul>
    <p style="color: #555;">Please open the Consultz app and check your Withdrawals section for more details.</p>
  `

  await emailSender(
    consultant.email,
    `Withdrawal Status Updated – ${statusText}`,
    baseEmailTemplate(
      `Withdrawal ${statusText}`,
      consultant.firstName,
      content,
    ),
  )
}

// 8. When payment is confirmed → email to user (success + waiting for approval)
export const sendPaymentSuccessToUser = async (
  user: TUser,
  booking: TBookings,
  expert: TUser,
) => {
  if (!user?.email || !user.emailNotify?.payment) return

  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const content = `
    <p style="color: #555;">Your payment of $${booking.price} has been successfully processed!</p>
    <ul style="color: #555; line-height: 1.6;">
      <li><strong>Session:</strong> ${booking.sessionType}</li>
      <li><strong>With:</strong> ${expert.firstName} ${expert.lastName}</li>
      <li><strong>Date & Time:</strong> ${sessionInfo}</li>
    </ul>
    <p style="color: #555;">Your booking is now awaiting approval from the consultant. You will be notified once it's confirmed.</p>
    <p style="color: #555;">Please open the Consultz app to view your booking details.</p>
    <p style="color: #555;">Thank you for choosing Consultz!</p>
  `

  await emailSender(
    user.email,
    'Payment Successful – Booking Pending Approval',
    baseEmailTemplate('Payment Successful', user.firstName, content),
  )
}

/**
 * Send email when a booking is automatically marked as "not_responded"
 * (System-initiated + Refund processed)
 */
export const sendNotRespondedEmail = async (
  user: TUser, // the booker (customer)
  consult: TUser, // the expert/consultant
  booking: TBookings,
  refundProcessed: boolean = false,
): Promise<void> => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  // Email for the booker (user)
  const userEmailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #d9534f;">Booking Not Responded</h2>
      <p style="color: #555;">Dear ${user.firstName},</p>
      <p style="color: #555;">
        Your confirmed booking with <strong>${consult.firstName} ${consult.lastName}</strong> 
        on <strong>${sessionInfo}</strong> was not completed by the consultant.
      </p>
      <p style="color: #555;">
        The booking has been automatically marked as <strong>Not Responded</strong>.
      </p>
      ${
        refundProcessed
          ? `<p style="color: #d9534f; font-weight: bold;">
               A full refund has been initiated and will be processed shortly.
             </p>`
          : `<p style="color: #555;">
               No refund was needed for this booking.
             </p>`
      }
      <p style="color: #555;">If you have any questions, please contact support.</p>
      <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
        <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
      </div>
    </div>
  `

  // Email for the consultant (expert)
  const consultEmailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #d9534f;">Booking Marked as Not Responded</h2>
      <p style="color: #555;">Dear ${consult.firstName},</p>
      <p style="color: #555;">
        Your confirmed booking with <strong>${user.firstName} ${user.lastName}</strong> 
        on <strong>${sessionInfo}</strong> was not completed.
      </p>
      <p style="color: #555;">
        The booking has been automatically marked as <strong>Not Responded</strong> 
        because you did not attend the session.
      </p>
      <p style="color: #555;">Please ensure you respond to future bookings in a timely manner.</p>
      <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
        <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
      </div>
    </div>
  `

  // Send emails in parallel (non-blocking)
  const emailTasks: Promise<void>[] = []

  if (user?.email && user.emailNotify?.booking) {
    emailTasks.push(
      emailSender(user.email, 'Booking Not Responded', userEmailContent).catch(
        (err) =>
          console.error(
            `Failed to send not_responded email to user ${user._id}:`,
            err,
          ),
      ),
    )
  }

  if (consult?.email && consult.emailNotify?.booking) {
    emailTasks.push(
      emailSender(
        consult.email,
        'Booking Not Responded',
        consultEmailContent,
      ).catch((err) =>
        console.error(
          `Failed to send not_responded email to consultant ${consult._id}:`,
          err,
        ),
      ),
    )
  }

  await Promise.all(emailTasks)
}
