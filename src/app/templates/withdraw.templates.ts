import { TUser } from '../modules/user/user.interface'
import { TBookings } from '../modules/booking/booking.interface'
import { TWithdraw } from '../modules/withdraw/withdraw.interface'
import { TWithdrawStatus } from '../modules/withdraw/withdraw.constant'

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
          <tr>
            <td style="background:#1a1a1a; padding:24px 32px;">
              <p style="margin:0; color:#999999; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Consultz</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:20px; font-weight:700;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px; font-size:14px; color:#333333;">Dear ${recipientName},</p>
              ${body}
            </td>
          </tr>
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

const infoBlock = (rows: { label: string; value: string }[]) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #e8e8e8; border-radius:6px; margin:16px 0;">
    ${rows.map((row) => `
      <tr>
        <td style="padding:10px 16px; border-bottom:1px solid #eeeeee;">
          <span style="font-size:11px; color:#888888; display:block; margin-bottom:2px;">${row.label}</span>
          <span style="font-size:14px; color:#1a1a1a; font-weight:600;">${row.value}</span>
        </td>
      </tr>
    `).join('')}
  </table>
`

const noticeBlock = (text: string) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #cccccc; background:#f9f9f9; border-radius:0 6px 6px 0; margin:16px 0;">
    <tr>
      <td style="padding:12px 16px; font-size:13px; color:#444444; line-height:1.6;">${text}</td>
    </tr>
  </table>
`

const para = (text: string) =>
  `<p style="margin:0 0 14px; font-size:14px; color:#444444; line-height:1.7;">${text}</p>`

// ─────────────────────────────────────────────────────────────────────────────
// 1. Withdrawal completed → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const withdrawCompletedTemplate = (
  consultant: TUser,
  withdraw: TWithdraw,
  booking: TBookings,
  user: TUser,
): string => {
  const sessionStartTime = booking.localStartTime || booking.localTime || booking.startTime || 'N/A'
  const sessionEndTime = booking.localEndTime ? ` - ${booking.localEndTime}` : ''
  const sessionInfo = `${booking.localDate || booking.date || 'N/A'} � ${sessionStartTime}${sessionEndTime} (${booking.timezone || 'UTC'})`

  const body = `
    ${para('Your withdrawal request has been successfully processed.')}
    ${infoBlock([
      { label: 'Amount', value: `£${withdraw.amount.toFixed(2)}` },
      { label: 'From Booking', value: `${booking.sessionType} with ${user.firstName} ${user.lastName}` },
      { label: 'Session Date', value: sessionInfo },
      { label: 'Status', value: 'Completed' },
    ])}
    ${noticeBlock('The funds should now be available in your connected Stripe account. Please check your Earnings section in the app for full details.')}
    ${para('Thank you for being part of Consultz!')}
  `

  return baseLayout('Withdrawal Completed', consultant.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Withdrawal status changed → consultant
// ─────────────────────────────────────────────────────────────────────────────
export const withdrawStatusChangeTemplate = (
  consultant: TUser,
  withdraw: TWithdraw,
  newStatus: TWithdrawStatus,
): string => {
  const statusLabels: Record<string, string> = {
    completed: 'Completed',
    proceed:   'Processing',
    hold:      'On Hold',
  }

  const statusLabel = statusLabels[newStatus] || newStatus

  const body = `
    ${para('Your withdrawal request status has been updated.')}
    ${infoBlock([
      { label: 'Amount', value: `£${withdraw.amount.toFixed(2)}` },
      { label: 'Current Status', value: statusLabel },
    ])}
    ${
      newStatus === 'hold'
        ? noticeBlock('Your withdrawal is currently on hold. Please connect your Stripe account through the app to receive your earnings.')
        : noticeBlock('Please check your Withdrawals section in the Consultz app for more details.')
    }
  `

  return baseLayout(`Withdrawal ${statusLabel}`, consultant.firstName, body)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Withdrawal on hold → consultant (Stripe not connected)
// ─────────────────────────────────────────────────────────────────────────────
export const withdrawOnHoldTemplate = (
  consultant: TUser,
  withdraw: TWithdraw,
): string => {
  const body = `
    ${para('Your withdrawal request is currently on hold because your Stripe account is not yet connected.')}

    ${infoBlock([
      { label: 'Amount', value: `£${withdraw.amount.toFixed(2)}` },
      { label: 'Status', value: 'On Hold' },
      { label: 'Reason', value: 'Stripe account not connected' },
    ])}

    ${noticeBlock(
      'Please connect your Stripe account through the Consultz app. Once connected, your withdrawal will be processed automatically on the next scheduled transfer run.',
    )}

    ${para('If you need help connecting your Stripe account, please contact our support team.')}
  `

  return baseLayout('Withdrawal On Hold – Action Required', consultant.firstName, body)
}
