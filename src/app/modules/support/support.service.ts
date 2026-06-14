import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TSupport, TSupportMessage } from './support.interface'
import { Support } from './support.model'
import { User } from '../user/user.model'
import emailSender from '../../utils/emailSender'
import { SUPPORT_STATUS } from './support.constant'
import { Contents } from '../contents/contents.models'

const createSupportIntoDB = async (payload: TSupport, userId: string) => {
  // 1. Find user
  const author = await User.findById(userId)
  if (!author || author?.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'User not found!')
  }

  // 2. Get platform support email from Contents
  const contents = await Contents.findOne({ isDeleted: false }).select(
    'supportEmail',
  )

  // Fallback email added
  const supportEmail = contents?.supportEmail || 'investors@wealthdragons.co.uk'

  // 3. Prepare email content
  const emailContent = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
    <h2 style="color: #1a1a1a; margin-bottom: 20px; border-bottom: 2px solid #333333; padding-bottom: 12px;">
      New Support Request
    </h2>
    
    <p style="color: #333333; margin: 8px 0;">
      <strong>From:</strong> ${author.firstName} ${author.lastName} (${author.email})
    </p>
    <p style="color: #333333; margin: 8px 0;">
      <strong>Subject:</strong> ${payload.subject}
    </p>
    
    <hr style="border: none; border-top: 1px solid #dddddd; margin: 25px 0;">

    <p style="color: #1a1a1a; font-weight: bold; margin-bottom: 8px;">Message:</p>
    <p style="background: #f5f5f5; padding: 18px; border-radius: 6px; color: #333333; line-height: 1.6;">
      ${payload.messages}
    </p>
    
    <br>
    <p style="color: #666666; font-size: 12px; text-align: center; margin-top: 25px;">
      This message was sent from Consultz Support System.
    </p>
  </div>
`

  // 4. Send email to platform support
  try {
    await emailSender(
      supportEmail,
      `Support Request: ${payload.subject}`,
      emailContent,
    )

    console.log(`✅ Support email sent to ${supportEmail}`)
  } catch (error: any) {
    console.error('Failed to send support email:', error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to send support request',
    )
  }

  return {
    success: true,
    message:
      'Your support request has been sent successfully. We will get back to you soon.',
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

const getASupportFromDB = async (id: string) => {
  const result = await Support.findById(id).populate([
    {
      path: 'author',
      select: 'firstName lastName email photoUrl',
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Support not found')
  }

  return result
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
  createSupportIntoDB,
  sentSupportMessageIntoDB,
  getAllSupportsFromDB,
  getASupportFromDB,
  deleteASupportFromDB,
}
