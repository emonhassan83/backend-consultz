type TAcknowledgementPayload = {
  referenceId: string
  type: 'support' | 'feedback'
  subject: string
  summary: string
  expectedResponseTime: string
  submittedAt?: string
}

export const createSupportAcknowledgementTemplate = (
  author: { firstName: string; lastName: string; email: string },
  payload: TAcknowledgementPayload,
): string => {
  const title =
    payload.type === 'feedback'
      ? 'Feedback Received'
      : 'Support Request Received'
  const label =
    payload.type === 'feedback'
      ? 'feedback'
      : 'support request'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e0e0e0;">
          <tr>
            <td style="background:#1a1a2e; padding:28px 32px;">
              <p style="margin:0; color:#e07b39; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Consultz</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:22px; font-weight:700;">${title}</h1>
              <p style="margin:6px 0 0; color:#ffffff; font-size:13px;">Reference: <strong>${payload.referenceId}</strong></p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px; font-size:14px; color:#333333; line-height:1.7;">
                Dear ${author.firstName},
              </p>
              <p style="margin:0 0 16px; font-size:14px; color:#333333; line-height:1.7;">
                Thank you for contacting Consultz. We have received your ${label} and our team will review it.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin:18px 0;">
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #eeeeee;">
                    <p style="margin:0 0 4px; font-size:11px; color:#999999;">Reference Number</p>
                    <p style="margin:0; font-size:14px; color:#1a1a1a; font-weight:700;">${payload.referenceId}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #eeeeee;">
                    <p style="margin:0 0 4px; font-size:11px; color:#999999;">Subject</p>
                    <p style="margin:0; font-size:14px; color:#1a1a1a; font-weight:600;">${payload.subject}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #eeeeee;">
                    <p style="margin:0 0 4px; font-size:11px; color:#999999;">Submitted On</p>
                    <p style="margin:0; font-size:14px; color:#1a1a1a; font-weight:600;">${payload.submittedAt || new Date().toLocaleDateString('en-GB')}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0 0 4px; font-size:11px; color:#999999;">Expected Response Time</p>
                    <p style="margin:0; font-size:14px; color:#1a1a1a; font-weight:600;">${payload.expectedResponseTime}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px; font-size:11px; color:#999999; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Copy / Summary of Your Submission</p>
              <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:6px; padding:14px; font-size:14px; color:#333333; line-height:1.7; white-space:pre-wrap;">${payload.summary}</div>

              <p style="margin:18px 0 0; font-size:14px; color:#444444; line-height:1.7;">
                Please keep this reference number for any follow-up about this submission.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f9f9f9; border-top:1px solid #eeeeee; padding:16px 32px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#999999;">Best regards, <strong>Consultz Team</strong></p>
              <p style="margin:6px 0 0; font-size:12px; color:#cccccc;">© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}
