import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TContentMeta } from './contentMeta.interface'
import { ContentMeta } from './contentMeta.model'
import { User } from '../user/user.model'
import { sendCarRatingLikeNotificationToAuthor } from './contentMeta.utils'

const createContentMetaIntoDB = async (payload: TContentMeta) => {
  const contentMeta = await ContentMeta.create(payload)
  if (!contentMeta) {
    throw new AppError(httpStatus.CONFLICT, 'Content Meta not created!')
  }

  return contentMeta
}

const getAContentMetaFromDB = async (contentId: string) => {
  const result = await ContentMeta.findOne({ content: contentId })
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content Meta not found')
  }

  return result
}

const updateAContentMetaFromDB = async (
  id: string,
  payload: Partial<TContentMeta>,
) => {
  const result = await ContentMeta.findByIdAndUpdate(id, payload, { new: true })
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content Meta not found')
  }

  return result
}

const likeContentFromDB = async (contentId: string, user: any) => {
  const contentMeta = await ContentMeta.findById(contentId)
  if (!contentMeta) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content Meta not found')
  }

  // If the user has already liked the content, return the existing document without updating
  if (contentMeta?.likeBy?.includes(user._id)) {
    return contentMeta
  }

  const updateContentMeta = await ContentMeta.findByIdAndUpdate(
    contentId,
    {
      $inc: { like: 1 }, // Increase like count by 1
      $addToSet: { likeBy: user._id }, // Add user to likeBy array (prevents duplicates)
    },
    { new: true, runValidators: true },
  )

  if (!updateContentMeta) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content Meta not updated')
  }

  return updateContentMeta
}

const unlikeContentFromDB = async (contentId: string, user: any) => {
  const contentMeta = await ContentMeta.findById(contentId)
  if (!contentMeta) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content Meta not found')
  }

  // If the user has already unliked the content, return the existing document without updating
  if (!contentMeta?.likeBy?.includes(user._id)) {
    return contentMeta
  }

  const updateContentMeta = await ContentMeta.findByIdAndUpdate(
    contentId,
    {
      $inc: { like: -1 }, // Decrease like count by 1
      $pull: { likeBy: user._id }, // Remove user from likeBy array
    },
    { new: true, runValidators: true },
  )

  if (!updateContentMeta) {
    throw new AppError(httpStatus.NOT_FOUND, 'Content Meta not updated')
  }

  return updateContentMeta
}

export const ContentMetaService = {
  createContentMetaIntoDB,
  getAContentMetaFromDB,
  updateAContentMetaFromDB,
  likeContentFromDB,
  unlikeContentFromDB
}
