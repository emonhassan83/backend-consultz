import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TSupport, TSupportMessage } from './support.interface'
import { Support } from './support.model'
import { User } from '../user/user.model'
import emailSender from '../../utils/emailSender'
import { SUPPORT_STATUS, TAudience } from './support.constant'

const createSupportIntoDB = async (payload: TSupport, userId: string) => {
  // find user by id
  const author = await User.findById(userId)
  if (!author || author?.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is not found !')
  }

  // assign author id to support payload
  payload.author = author._id
  payload.email = author.email

  // assign support audience based on user role
  if (author.role === 'consult' || author.role === 'expert') {
    payload.audience = author.role as TAudience
  } else {
    throw new AppError(httpStatus.FORBIDDEN, 'Invalid support role for user!')
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
