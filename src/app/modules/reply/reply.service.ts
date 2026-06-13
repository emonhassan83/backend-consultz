import httpStatus from 'http-status'
import QueryBuilder from '../../builder/QueryBuilder'
import { TReply } from './reply.interface'
import { Reply } from './reply.models'
import AppError from '../../errors/AppError'

const createReply = async (payload: TReply) => {
  return await Reply.create(payload)
}

const getAllReply = async (query: Record<string, any>) => {
  const ReplyModel = new QueryBuilder(
    Reply.find().populate([
      { path: 'user', select: 'name photoUrl' }
    ]),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()
    .fields()

  const data = await ReplyModel.modelQuery
  const meta = await ReplyModel.countTotal()

  return {
    data,
    meta,
  }
}

const getReplyById = async (id: string) => {
  const result = await Reply.findById(id).populate([
    { path: 'user', select: 'name photoUrl' }
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Reply not found!')
  }
  return result
}

const updateReply = async (
  id: string,
  payload: Partial<TReply>,
  userId: string,
) => {
  const comment = await Reply.findById(id)
  if (comment?.user?.toString() !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Unauthorized to Update this comment',
    )
  }
  const result = await Reply.findByIdAndUpdate(id, payload, {
    returnDocument: 'after',
  }).populate([
    { path: 'user', select: 'name email photoUrl' },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update Reply')
  }
  return result
}

const deleteReply = async (id: string, userId: string) => {
  const result = await Reply.findByIdAndDelete(id)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete Reply')
  }

  return result
}

export const ReplyService = {
  createReply,
  getAllReply,
  getReplyById,
  updateReply,
  deleteReply,
}
