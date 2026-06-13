import httpStatus from 'http-status'
import { TContents } from './contents.interface'
import QueryBuilder from '../../builder/QueryBuilder'
import { Contents } from './contents.models'
import AppError from '../../errors/AppError'

// Create a new content
const createContents = async (payload: TContents) => {
  const result = await Contents.create(payload)
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Content creation failed')
  }

  return result
}

// Get all contents
const getAllContents = async (query: Record<string, any>) => {
  const ContentModel = new QueryBuilder(
    Contents.find({ isDeleted: false }).select('termsAndConditions paymentHoldDays consultationFee updatedAt') as any,
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()
    .fields()

  const data = await ContentModel.modelQuery
  const meta = await ContentModel.countTotal()
  return {
    data,
    meta,
  }
}

// Update content
const updateContents = async (payload: Partial<TContents>) => {
  const content = await Contents.findOne().select('termsAndConditions paymentHoldDays consultationFee updatedAt')
  if (!content || content?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content not found!')
  }

  // Update the content document
  Object.assign(content, payload)
  await content.save()

  return content
}

export const contentsService = {
  createContents,
  getAllContents,
  updateContents
}
