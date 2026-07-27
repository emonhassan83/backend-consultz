import { TSupport } from '../modules/support/support.interface'

export const createSupportEmailTemplate = (
  author: { firstName: string; lastName: string; email: string },
  payload: TSupport,
): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Support Request</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; border: 1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="background: #1a1a2e; padding: 28px 32px;">
              <p style="margin:0; color:#e07b39; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Consultz Support</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:22px; font-weight:700;">New Support Request</h1>
              <p style="margin:6px 0 0; color:#aaaaaa; font-size:13px;">
                Submitted on ${new Date().toLocaleDateString('en-GB')}
              </p>
              ${payload.referenceId ? `<p style="margin:6px 0 0; color:#ffffff; font-size:13px;">Reference: <strong>${payload.referenceId}</strong></p>` : ''}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px;">

              <!-- YOUR DETAILS -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Sender Details</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:8px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="padding: 6px 0;">
                          <p style="margin:0; font-size:11px; color:#999;">Name</p>
                          <p style="margin:4px 0 0; font-size:14px; color:#1a1a1a; font-weight:600;">${author.firstName} ${author.lastName}</p>
                        </td>
                        <td width="50%" style="padding: 6px 0;">
                          <p style="margin:0; font-size:11px; color:#999;">Email</p>
                          <p style="margin:4px 0 0; font-size:14px; color:#1a1a1a; font-weight:600;">${author.email}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SUBJECT -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Subject</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;">
                    ${
                      payload.referenceId
                        ? `
                    <p style="margin:0 0 8px; font-size:11px; color:#999;">Reference Number</p>
                    <p style="margin:0 0 16px; font-size:14px; color:#1a1a1a; font-weight:700;">${payload.referenceId}</p>
                    `
                        : ''
                    }
                    <span style="
                     background:#ffffff;
                      border:1px solid #e0e0e0;
                      border-radius:6px;
                      padding:8px 16px;
                      font-size:14px;
                      color:#1a1a1a;
                      line-height:1.8;
                      white-space: pre-wrap;
                    ">${payload.subject}</span>
                  </td>
                </tr>
              </table>

              <!-- MESSAGE -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Message</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;">
                    <div style="
                      background:#ffffff;
                      border:1px solid #e0e0e0;
                      border-radius:6px;
                      padding:16px;
                      font-size:14px;
                      color:#1a1a1a;
                      line-height:1.8;
                      white-space: pre-wrap;
                    ">${payload.messages}</div>
                  </td>
                </tr>
              </table>

              <!-- NOTICE -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0; border:1px solid #ffe0b2; border-radius:8px; margin-bottom:8px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0; font-size:12px; color:#e65100;">
                      ⚠️ This is a legitimate support request submitted directly from the Consultz platform by a verified user.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9; border-top:1px solid #eeeeee; padding:16px 32px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#999999;">
                All support requests are reviewed and responded to within 24–48 hours.
              </p>
              <p style="margin:6px 0 0; font-size:12px; color:#cccccc;">
                © ${new Date().getFullYear()} Consultz App. All rights reserved.
              </p>
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
