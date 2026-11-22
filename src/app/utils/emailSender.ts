import nodemailer from 'nodemailer'
import httpStatus from 'http-status'
import config from '../config'
import AppError from '../errors/AppError'

// Sends mail directly over SMTP: Brevo (smtp-relay.brevo.com) when the Brevo
// credentials are set, otherwise the older Gmail setup. See emailConfig.ts.
// The SMTP login is not the From address: Brevo logs in with its own login
// and sends as the verified sender (e.g. info@consultz.com).
const transporter = nodemailer.createTransport({
  host: config.emailSender.smtp_host,
  port: config.emailSender.smtp_port,
  secure: config.emailSender.smtp_secure,
  // On 587 / 2525 the connection must upgrade to TLS before logging in
  requireTLS: !config.emailSender.smtp_secure,
  auth: {
    user: config.emailSender.smtp_user,
    pass: config.emailSender.smtp_pass,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
})

const fromAddress = () => config.emailSender.from

const emailSender = async (
  email: string,
  subject: string,
  html: string,
): Promise<void> => {
  try {
    await transporter.sendMail({
      from: fromAddress(),
      to: email,
      subject,
      html,
    })
  } catch (error: any) {
    console.error('Email sending error:', {
      to: email,
      subject,
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
      response: error?.response,
      message: error?.message,
    })
    throw new AppError(httpStatus.BAD_REQUEST, 'Error sending email')
  }
}

// Called once at startup so a bad SMTP setup shows up in the logs right away
// instead of on the first forgot-password request.
export const verifyEmailTransport = async (): Promise<boolean> => {
  for (const warning of config.emailSender.warnings) {
    console.warn(`Email config: ${warning}`)
  }
  try {
    await transporter.verify()
    console.log(
      `SMTP ready (${config.emailSender.provider}, ${config.emailSender.smtp_host}:${config.emailSender.smtp_port}, from ${config.emailSender.email})`,
    )
    return true
  } catch (error: any) {
    console.error('SMTP verify failed:', {
      code: error?.code,
      responseCode: error?.responseCode,
      response: error?.response,
      message: error?.message,
    })
    return false
  }
}

export default emailSender
