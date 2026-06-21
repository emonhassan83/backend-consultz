import { TFeedback } from '../modules/support/support.interface'

export const createFeedbackEmailTemplate = (
  author: { firstName: string; lastName: string; email: string },
  payload: TFeedback,
): string => {
  const priorityColors: Record<string, string> = {
    Critical: '#dc2626',
    High:     '#ea580c',
    Medium:   '#d97706',
    Low:      '#16a34a',
  }

  const priorityColor = priorityColors[payload.priority] || '#d97706'

  // ✅ Tag chip style — same as business impact
  const chipStyle = (color: string) => `
    display: inline-block;
    background: #ffffff;
    color: ${color};
    border: 1px solid ${color};
    border-radius: 20px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 600;
    margin: 3px;
  `

  const businessImpactHtml =
    payload.businessImpact && payload.businessImpact.length > 0
      ? payload.businessImpact
          .map(
            (impact) =>
              `<span style="${chipStyle('#e07b39')}">${impact}</span>`,
          )
          .join('')
      : '<span style="color: #999; font-size:13px;">Not specified</span>'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>User Feedback Intake</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; border: 1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="background: #1a1a2e; padding: 28px 32px;">
              <p style="margin:0; color:#e07b39; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Consultz Feedback</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:22px; font-weight:700;">User Feedback Intake</h1>
              <p style="margin:6px 0 0; color:#aaaaaa; font-size:13px;">
                Submitted on ${payload.submissionDate || new Date().toLocaleDateString('en-GB')}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px;">

              <!-- YOUR DETAILS -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Your Details</p>
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

              <!-- TYPE & PRIORITY -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Type & Priority</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px; font-size:11px; color:#999;">Feedback Type</p>
                    <span style="${chipStyle('#e07b39')}">${payload.feedbackType}</span>

                    <p style="margin:16px 0 8px; font-size:11px; color:#999;">Priority</p>
                    <span style="${chipStyle(priorityColor)}">${payload.priority}</span>
                  </td>
                </tr>
              </table>

              <!-- DETAILS -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Details</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;">

                    ${
                      payload.relatedPageOrFeature
                        ? `
                      <p style="margin:0 0 4px; font-size:11px; color:#999;">Related Page or Feature</p>
                      <p style="margin:0 0 16px; font-size:14px; color:#1a1a1a;">${payload.relatedPageOrFeature}</p>
                    `
                        : ''
                    }

                    <p style="margin:0 0 4px; font-size:11px; color:#999;">Description</p>
                    <div style="
                      background:#ffffff;
                      border:1px solid #e0e0e0;
                      border-radius:6px;
                      padding:12px;
                      font-size:14px;
                      color:#1a1a1a;
                      line-height:1.6;
                      margin-bottom:16px;
                      white-space: pre-wrap;
                    ">${payload.description}</div>

                    ${
                      payload.expectedOutcome
                        ? `
                      <p style="margin:0 0 4px; font-size:11px; color:#999;">Expected Outcome</p>
                      <div style="
                        background:#ffffff;
                        border:1px solid #e0e0e0;
                        border-radius:6px;
                        padding:12px;
                        font-size:14px;
                        color:#1a1a1a;
                        line-height:1.6;
                        white-space: pre-wrap;
                      ">${payload.expectedOutcome}</div>
                    `
                        : ''
                    }

                  </td>
                </tr>
              </table>

              <!-- BUSINESS IMPACT -->
              <p style="margin: 0 0 6px; font-size:10px; font-weight:700; color:#e07b39; letter-spacing:2px; text-transform:uppercase;">Business Impact</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;">
                    <div>${businessImpactHtml}</div>

                    ${
                      payload.additionalComments
                        ? `
                      <p style="margin:16px 0 4px; font-size:11px; color:#999;">Additional Comments</p>
                      <div style="
                        background:#ffffff;
                        border:1px solid #e0e0e0;
                        border-radius:6px;
                        padding:12px;
                        font-size:14px;
                        color:#1a1a1a;
                        line-height:1.6;
                        white-space: pre-wrap;
                      ">${payload.additionalComments}</div>
                    `
                        : ''
                    }
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9; border-top:1px solid #eeeeee; padding:16px 32px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#999999;">
                All submissions are reviewed and prioritised by the Admin team and Vincent before development.
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