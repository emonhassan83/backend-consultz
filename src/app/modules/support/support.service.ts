import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TSupport, TSupportMessage } from './support.interface'
import { Support } from './support.model'
import { User } from '../user/user.model'
import emailSender from '../../utils/emailSender'
import { SUPPORT_STATUS, TSupportStatus } from './support.constant'
import { sendSupportNotifyToUser } from './support.utils'

const createSupportIntoDB = async (payload: TSupport) => {
  const { author: authorId } = payload

  // find author
  const author = await User.findById(authorId)
  if (!author || author?.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is not found !')
  }

  const support = await Support.create(payload)
  if (!support) {
    throw new AppError(httpStatus.CONFLICT, 'Support not created!')
  }

  return support
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

  // 4️⃣ support notification sent notification
  await User.findById(support.author).then((user) => {
    sendSupportNotifyToUser(updatedSupport as TSupport, user as any)
  })

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
