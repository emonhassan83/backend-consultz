import { TUser } from '../modules/user/user.interface'
import { TBookings } from '../modules/booking/booking.interface'

// ── Base layout ───────────────────────────────────────────────────────────────
const baseLayout = (title: string, recipientName: string, body: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a; padding:24px 32px;">
              <p style="margin:0; color:#999999; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Consultz</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:20px; font-weight:700;">${title}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px; font-size:14px; color:#333333;">Dear ${recipientName},</p>
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9; border-top:1px solid #eeeeee; padding:16px 32px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#999999;">Best regards, <strong>Consultz Team</strong></p>
              <p style="margin:6px 0 0; font-size:11px; color:#cccccc;">© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

// ── Info block ─────────────────────────────────────────────────────────────────
const infoBlock = (rows: { label: string; value: string }[]) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #e8e8e8; border-radius:6px; margin:16px 0;">
    ${rows
      .map(
        (row) => `
      <tr>
        <td style="padding:10px 16px; border-bottom:1px solid #eeeeee;">
          <span style="font-size:11px; color:#888888; display:block; margin-bottom:2px;">${row.label}</span>
          <span style="font-size:14px; color:#1a1a1a; font-weight:600;">${row.value}</span>
        </td>
      </tr>
    `,
      )
      .join('')}
  </table>
`

// ── Notice block ──────────────────────────────────────────────────────────────
const noticeBlock = (text: string, type: 'info' | 'warning' | 'success' = 'info') => {
  const borderColor = type === 'warning' ? '#999999' : type === 'success' ? '#555555' : '#cccccc'
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid ${borderColor}; background:#f9f9f9; border-radius:0 6px 6px 0; margin:16px 0;">
      <tr>
        <td style="padding:12px 16px; font-size:13px; color:#444444; line-height:1.6;">${text}</td>
      </tr>
    </table>
  `
}

// ── Text paragraph ─────────────────────────────────────────────────────────────
const para = (text: string) =>
  `<p style="margin:0 0 14px; font-size:14px; color:#444444; line-height:1.7;">${text}</p>`

// ─────────────────────────────────────────────────────────────────────────────
// 1. New booking request → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const newBookingToConsultantTemplate = (
  consult: TUser,
  booking: TBookings,
  user: TUser,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para('You have received a new booking request. Please review the details below and respond from your dashboard.')}
    ${infoBlock([
      { label: 'Client', value: `${user.firstName} ${user.lastName}` },
      { label: 'Session Type', value: booking.sessionType },
      { label: 'Date & Time', value: sessionInfo },
      { label: 'Amount', value: `£${booking.price}` },
    ])}
    ${noticeBlock('Please confirm or decline this request as soon as possible to avoid automatic cancellation.')}
  `

  return baseLayout('New Booking Request', consult.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Booking cancelled → user
// ─────────────────────────────────────────────────────────────────────────────
export const bookingCancelledToUserTemplate = (
  user: TUser,
  consult: TUser,
  booking: TBookings,
  reason: string,
  cancelledByName: string,
  withRefund: boolean,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`Your booking with <strong>${consult.firstName} ${consult.lastName}</strong> has been cancelled by <strong>${cancelledByName}</strong>.`)}
    ${infoBlock([
      { label: 'Session', value: sessionInfo },
      { label: 'Reason', value: reason },
    ])}
    ${withRefund ? noticeBlock('A full refund has been initiated and will be reflected in your account shortly.', 'info') : ''}
    ${para('If this was unexpected, please contact our support team.')}
  `

  return baseLayout('Booking Cancelled', user.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Booking cancelled → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const bookingCancelledToConsultantTemplate = (
  consult: TUser,
  user: TUser,
  booking: TBookings,
  reason: string,
  cancelledByName: string,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`Your booking with <strong>${user.firstName} ${user.lastName}</strong> has been cancelled by <strong>${cancelledByName}</strong>.`)}
    ${infoBlock([
      { label: 'Session', value: sessionInfo },
      { label: 'Reason', value: reason },
    ])}
    ${para('If you have any questions, please contact our support team.')}
  `

  return baseLayout('Booking Cancelled', consult.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Session completed → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const sessionCompletedToConsultantTemplate = (
  consult: TUser,
  booking: TBookings,
  user: TUser,
  payment: any,
  holdDays = 7,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const isPaymentObject = typeof payment === 'object' && payment !== null
  const formatMoney = (amount?: number) => `£${Number(amount || 0).toFixed(2)}`

  const consultationFee = isPaymentObject ? payment.consultationFee : booking.price
  const platformTotal = isPaymentObject ? payment.platformTotal : 0
  const consultAmount = isPaymentObject ? payment.consultAmount : payment
  const expertVatOwed = isPaymentObject ? payment.expertVatOwed : 0
  const expertNet = isPaymentObject ? payment.expertNet : consultAmount

  const rows = [
    { label: 'Session', value: sessionInfo },
    { label: 'Net Earnings', value: `£${(expertNet || 0).toFixed(2)}` },
  ]

  if (isPaymentObject && payment.isExpertVatRegistered) {
    rows.push({ label: 'VAT Owed', value: `£${(expertVatOwed || 0).toFixed(2)}` })
  }

  rows.push(
    { label: 'Total Earnings', value: `£${(consultAmount || 0).toFixed(2)}` },
    { label: 'Status', value: 'Payment Processing' }
  )

  rows.length = 0
  rows.push(
    { label: 'Session', value: sessionInfo },
    { label: 'Consultation Fee', value: formatMoney(consultationFee) },
  )

  rows.push(
    { label: 'Total Platform Deduction', value: formatMoney(platformTotal) },
    { label: 'Amount Scheduled for Transfer', value: formatMoney(consultAmount) },
    { label: 'Status', value: 'Payment Processing' },
  )

  const body = `
    ${para(`Your session with <strong>${user.firstName} ${user.lastName}</strong> has been successfully completed.`)}
    ${infoBlock(rows)}
    ${noticeBlock(`Your payment will remain on hold for <strong>${holdDays} day${holdDays === 1 ? '' : 's'}</strong> after session completion. Once the hold period ends, the transfer amount will be sent to your connected Stripe account automatically. If your Stripe account is not connected, the withdrawal will stay on hold until you connect it.`)}
    ${para('Thank you for your service on Consultz.')}
  `

  return baseLayout('Session Completed', consult.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Booking rescheduled → user
// ─────────────────────────────────────────────────────────────────────────────
export const bookingRescheduledToUserTemplate = (
  user: TUser,
  consult: TUser,
  booking: TBookings,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`Your booking with <strong>${consult.firstName} ${consult.lastName}</strong> has been rescheduled.`)}
    ${infoBlock([
      { label: 'New Date & Time', value: sessionInfo },
      { label: 'Session Type', value: booking.sessionType },
    ])}
    ${noticeBlock('Please ensure you are available at the new time.')}
  `

  return baseLayout('Booking Rescheduled', user.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Booking rescheduled → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const bookingRescheduledToConsultantTemplate = (
  consult: TUser,
  user: TUser,
  booking: TBookings,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`Your booking with <strong>${user.firstName} ${user.lastName}</strong> has been rescheduled.`)}
    ${infoBlock([
      { label: 'New Date & Time', value: sessionInfo },
      { label: 'Session Type', value: booking.sessionType },
    ])}
    ${noticeBlock('Please update your schedule accordingly.')}
  `

  return baseLayout('Booking Rescheduled', consult.firstName, body)
}

export const scheduleChangeRequestToUserTemplate = (
  user: TUser,
  consult: TUser,
  booking: TBookings,
  reason?: string,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`<strong>${consult.firstName} ${consult.lastName}</strong> has requested a schedule change for your booking.`)}
    ${infoBlock([
      { label: 'Current Date & Time', value: sessionInfo },
      { label: 'Session Type', value: booking.sessionType },
      ...(reason ? [{ label: 'Reason', value: reason }] : []),
    ])}
    ${noticeBlock('Please open the app and reschedule this booking to a time that works for you.')}
  `

  return baseLayout('Schedule Change Requested', user.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Session reminder (10 min / join now)
// ─────────────────────────────────────────────────────────────────────────────
export const sessionReminderTemplate = (
  recipientName: string,
  otherName: string,
  sessionInfo: string,
  isJoinCall: boolean,
): string => {
  const title = isJoinCall ? 'Join Your Session Now' : 'Session Starting Soon'

  const body = `
    ${para(isJoinCall ? 'Your session is starting now. Please join immediately.' : 'Your session is starting in 10 minutes. Please be ready.')}
    ${infoBlock([
      { label: 'With', value: otherName },
      { label: 'Date & Time', value: sessionInfo },
    ])}
    ${noticeBlock('Please check your dashboard and join the call on time.')}
  `

  return baseLayout(title, recipientName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Not responded → user (detailed refund message)
// ─────────────────────────────────────────────────────────────────────────────
export const notRespondedToUserTemplate = (
  user: TUser,
  consult: TUser,
  booking: TBookings,
  refundProcessed: boolean,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`We're sorry to inform you that your confirmed booking with <strong>${consult.firstName} ${consult.lastName}</strong> has been automatically cancelled because the consultant did not respond within the required time.`)}

    ${infoBlock([
      { label: 'Consultant', value: `${consult.firstName} ${consult.lastName}` },
      { label: 'Session', value: sessionInfo },
      { label: 'Session Type', value: booking.sessionType },
      { label: 'Amount Paid', value: `£${booking.price}` },
      { label: 'Status', value: 'Cancelled – Consultant Not Responded' },
    ])}

    ${
      refundProcessed
        ? noticeBlock(
            `Your booking has been cancelled successfully, and a full refund of <strong>£${booking.price}</strong> has been initiated. The amount will be credited back to your original payment method within approximately <strong>3 to 7 business days</strong>, depending on your bank's processing time. If you do not see the refund after this period, please contact your bank or reach out to our support team.`,
            'info',
          )
        : noticeBlock(
            `Your booking has been cancelled. We received your payment of <strong>£${booking.price}</strong>, but the refund could not be initiated automatically. Our support team will review it and arrange the full refund to your original payment method.`,
            'info',
          )
    }

    ${para('We sincerely apologise. The consultant\'s reliability score has been affected as a result of this missed session.')}
    ${para('You are welcome to rebook with another consultant at any time. If you need further assistance, please contact our support team.')}
  `

  return baseLayout('Your Booking Has Been Cancelled', user.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Not responded → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const notRespondedToConsultantTemplate = (
  consult: TUser,
  user: TUser,
  booking: TBookings,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const body = `
    ${para(`Your booking request with <strong>${user.firstName} ${user.lastName}</strong> was closed because no response was received in time.`)}
    ${infoBlock([
      { label: 'Session', value: sessionInfo },
      { label: 'Status', value: 'No Response Received' },
    ])}
    ${noticeBlock('This booking request was automatically closed because no response was received in time.<br/><br/>Please ensure that you respond to future booking requests promptly (accept or decline) to maintain your reliability rating.', 'warning')}
  `

  return baseLayout('Booking Request Closed', consult.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Payment success → user
// ─────────────────────────────────────────────────────────────────────────────
export const paymentSuccessToUserTemplate = (
  user: TUser,
  booking: TBookings,
  expert: TUser,
  payment?: any,
): string => {
  const sessionInfo = `${booking.localDate} • ${booking.localTime} (${booking.timezone})`

  const isPaymentObject = typeof payment === 'object' && payment !== null
  const subtotal = isPaymentObject ? payment.consultationFee : booking.price
  const vatAmount = isPaymentObject ? payment.consultantVat : 0
  const totalAmount = isPaymentObject ? payment.amount : booking.price
  const isExpertVatRegistered = isPaymentObject ? payment.isExpertVatRegistered : false
  const vatNumber = expert.vatRegistrationNumber || 'N/A'

  const rows = [
    { label: 'Expert', value: `${expert.firstName} ${expert.lastName}` },
    { label: 'Session Type', value: booking.sessionType },
    { label: 'Date & Time', value: sessionInfo },
  ]

  if (isExpertVatRegistered) {
    rows.push({ label: 'Expert VAT Registration Number', value: vatNumber })
  }

  rows.push(
    { label: 'Subtotal (excl. VAT)', value: `£${(subtotal || 0).toFixed(2)}` },
    { label: 'VAT (Tax)', value: `£${(vatAmount || 0).toFixed(2)}` },
    { label: 'Total Amount Paid (incl. VAT)', value: `£${(totalAmount || 0).toFixed(2)}` }
  )

  const body = `
    ${para('Your payment has been successfully processed. Your booking is now pending approval from the consultant.')}
    ${infoBlock(rows)}
    ${noticeBlock('This receipt can be used by VAT-registered businesses for tax purposes. You will be notified once the consultant confirms your booking.')}
    ${para('Thank you for choosing Consultz!')}
  `

  return baseLayout('Payment Successful', user.firstName, body)
}
