import emailSender from './emailSender'
import { TUser } from '../modules/user/user.interface'
import { TBookingSlots } from '../modules/bookingSlots/bookingSlots.interface'
import { TBookings } from '../modules/booking/booking.interface'

// 1. Send confirmation email for consult
export const sendNewBookingToConsultant = async (
  consult: TUser,
  booking: any,
  slot: any,
) => {
  const sessionInfo = `${slot.date} • ${slot.time} (${booking.timezone})`

  await emailSender(
    consult.email,
    'New Booking Confirmed! 🎉',
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #333;">New Booking Confirmed! 🎉</h2>
        <p style="color: #555;">Dear ${consult.firstName},</p>
        <p style="color: #555;">You have a new confirmed booking:</p>
        <ul style="color: #555; line-height: 1.6;">
          <li><strong>User:</strong> ${booking.user.firstName} ${booking.user.lastName}</li>
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
  slot: TBookingSlots,
  cancelledBy: 'user' | 'consult',
): Promise<void> => {
  // Format session info once
  const sessionInfo = `${slot.date} • ${slot.time} (${booking.timezone})`;
  const cancelledByName =
    cancelledBy === 'user'
      ? `${user.firstName} ${user.lastName}`
      : `${consult.firstName} ${consult.lastName}`;

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
  `;

  const userExtra = cancelledBy === 'user'
    ? '<p style="color: #d9534f; font-weight: bold;">Your refund is being processed as soon as possible. It will reflect in your account shortly.</p>'
    : '';

  const userEmailContent = createEmailContent(
    user.firstName,
    `${consult.firstName} ${consult.lastName}`,
    userExtra
  );

  const consultEmailContent = createEmailContent(
    consult.firstName,
    `${user.firstName} ${user.lastName}`,
    ''
  );

  // Prepare email sending tasks (only if conditions are met)
  const emailTasks: Promise<void>[] = [];

  if (user?.email && user.emailNotify?.booking) {
    emailTasks.push(
      emailSender(user.email, 'Booking Cancelled', userEmailContent).catch((err) =>
        console.error(`Failed to send cancellation email to user ${user._id}:`, err)
      )
    );
  }

  if (consult?.email && consult.emailNotify?.booking) {
    emailTasks.push(
      emailSender(consult.email, 'Booking Cancelled', consultEmailContent).catch((err) =>
        console.error(`Failed to send cancellation email to consultant ${consult._id}:`, err)
      )
    );
  }

  // Send all emails in parallel (non-blocking)
  await Promise.all(emailTasks);
};

// 3. booking complete email for consult
export const sendSessionCompletedToConsultant = async (
  consult: TUser,
  booking: any,
  slot: any,
) => {
  const sessionInfo = `${slot.date} • ${slot.time} (${booking.timezone})`

  await emailSender(
    consult.email,
    'Session Completed – Payment Processing',
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #5cb85c;">Session Completed</h2>
        <p style="color: #555;">Dear ${consult.firstName},</p>
        <p style="color: #555;">Your session with ${booking.user.firstName} ${booking.user.lastName} on ${sessionInfo} is now complete.</p>
        <p style="color: #555;">Payment of $${booking.price} is being processed and will be transferred to your account soon.</p>
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
  slot: TBookingSlots,
): Promise<void> => {
  // Format session info consistently
  const sessionInfo = `${slot.date} • ${slot.time} (${booking.timezone})`;

  // Common email styling (reused for both)
  const baseEmailTemplate = (recipientName: string, otherName: string, actionText: string) => `
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
  `;

  const userEmailContent = baseEmailTemplate(
    user.firstName,
    `${consult.firstName} ${consult.lastName}`,
    'Please make sure to be available at the new time.'
  );

  const consultEmailContent = baseEmailTemplate(
    consult.firstName,
    `${user.firstName} ${user.lastName}`,
    'Please update your schedule accordingly.'
  );

  // Send emails only if notifications are enabled
  const emailPromises: Promise<void>[] = [];

  if (user?.email && user.emailNotify?.schedule) {
    emailPromises.push(
      emailSender(user.email, 'Booking Rescheduled', userEmailContent)
        .catch(err => console.error(`Failed to send reschedule email to user ${user._id}:`, err))
    );
  }

  if (consult?.email && consult.emailNotify?.schedule) {
    emailPromises.push(
      emailSender(consult.email, 'Booking Rescheduled', consultEmailContent)
        .catch(err => console.error(`Failed to send reschedule email to consultant ${consult._id}:`, err))
    );
  }

  // Wait for all emails to finish (parallel)
  await Promise.all(emailPromises);
};

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
      ${isJoinCall 
        ? 'Your session is starting now!'
        : 'Your session is starting in 10 minutes.'}
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
`;
