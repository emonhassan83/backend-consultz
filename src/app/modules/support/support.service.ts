import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TFeedback, TSupport, TSupportMessage } from './support.interface'
import { Support } from './support.model'
import { User } from '../user/user.model'
import emailSender from '../../utils/emailSender'
import { SUPPORT_STATUS } from './support.constant'
import { Contents } from '../contents/contents.models'
import { createFeedbackEmailTemplate } from '../../templates/feedbackEmail.templete'
import { createSupportEmailTemplate } from '../../templates/supportEmail.template'

const FALLBACK_SUPPORT_EMAIL = 'investors@wealthdragons.co.uk'

// ── helper: support email fetch ───────────────────────────────────────────────
const getSupportEmail = async (): Promise<string> => {
  const supportEmailContent = await Contents.findOne({ key: 'supportEmail' }).lean()
  return supportEmailContent?.value || FALLBACK_SUPPORT_EMAIL
}

// ── helper: author fetch ──────────────────────────────────────────────────────
const getAuthor = async (userId: string) => {
  const author = await User.findById(userId).select('firstName lastName email isDeleted')
  if (!author || author.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'User not found!')
  }
  return author
}

export const sendSupportEmail = async (payload: TSupport, userId: string) => {
  const [author, supportEmail] = await Promise.all([
    getAuthor(userId),
    getSupportEmail(),
  ])

  const emailHtml = createSupportEmailTemplate(
    {
      firstName: author.firstName,
      lastName:  author.lastName,
      email:     author.email,
    },
    payload,
  )

  try {
    await emailSender(
      supportEmail,
      `Support Request: ${payload.subject}`,
      emailHtml
    )
    console.log(`✅ Support email sent to ${supportEmail}`)
  } catch (error: any) {
    console.error('Failed to send support email:', error)
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send support request')
  }

  return {
    success: true,
    message: 'Your support request has been sent successfully. We will get back to you soon.',
  }
}

export const sendFeedbackEmail = async (payload: TFeedback, userId: string) => {
  // 1. Find user
  const author = await User.findById(userId).select('firstName lastName email isDeleted')
  if (!author || author.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'User not found!')
  }

  // 2. Support email
  const supportEmailContent = await Contents.findOne({ key: 'supportEmail' }).lean()
  const supportEmail = supportEmailContent?.value || 'info@consultz.com'

  // 3. Set submission date if not provided
  if (!payload.submissionDate) {
    payload.submissionDate = new Date().toLocaleDateString('en-GB') // DD/MM/YYYY
  }

  // 4. Build email HTML
  const emailHtml = createFeedbackEmailTemplate(
    {
      firstName: author.firstName,
      lastName:  author.lastName,
      email:     author.email,
    },
    payload,
  )

  // 5. Send
  try {
    await emailSender(
      supportEmail,
      `[${payload.priority}] ${payload.feedbackType} — ${payload.subject ?? payload.description.slice(0, 60)}`,
      emailHtml,
    )
    console.log(`✅ Feedback email sent to ${supportEmail}`)
  } catch (error: any) {
    console.error('Failed to send feedback email:', error)
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send support request')
  }

  return {
    success: true,
    message: 'Your feedback has been submitted successfully. We will review it shortly.',
  }
}

const sentSupportMessageIntoDB = async (
  id: string,
  payload: TSupportMessage,
) => {
  const support = await Support.findById(id)
  if (!support) {
    throw new AppError(httpStatus.FORBIDDEN, 'This Support is not found !')
  }
  // 2️⃣ Compose email message
  const emailBody = `
    <h3>New Support Message</h3>
    <p><strong>From:</strong> ${support.email}</p>
    <p><strong>Subject:</strong> ${payload.subject}</p>
    <p><strong>Message:</strong></p>
    <p>${payload.messages}</p>
    <hr/>
    <p><em>Sent via Support Ticket ID: ${support._id}</em></p>
  `

  // 3️⃣ Send to support email inbox
  await emailSender(
    support.email,
    `Support Message: ${payload.subject}`,
    emailBody,
  )

  // 3️⃣ Update the record (message + subject + mark as completed)
  const updatedSupport = await Support.findByIdAndUpdate(
    id,
    {
      $set: {
        status: SUPPORT_STATUS.respond,
      },
    },
    { new: true },
  )

  return updatedSupport
}

const getAllSupportsFromDB = async (query: Record<string, unknown>) => {
  const supportQuery = new QueryBuilder(
    Support.find().populate([
      {
        path: 'author',
        select: 'firstName lastName email photoUrl',
      },
    ]),
    query,
  )
    .search(['subject'])
    .filter()
    .sort()
    .paginate()
    .fields()

  const result = await supportQuery.modelQuery
  const meta = await supportQuery.countTotal()

  return {
    meta,
    result,
  }
}

const deleteASupportFromDB = async (id: string) => {
  const support = await Support.findById(id)
  if (!support) {
    throw new AppError(httpStatus.FORBIDDEN, 'This Support is not found !')
  }

  const result = await Support.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Support Delete failed!')
  }

  return result
}

export const SupportService = {
  sendSupportEmail,
  sendFeedbackEmail,
  sentSupportMessageIntoDB,
  getAllSupportsFromDB,
  deleteASupportFromDB,
}
