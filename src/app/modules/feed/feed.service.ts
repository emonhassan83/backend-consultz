import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TFeed } from './feed.interface'
import { Feed } from './feed.model'
import { User } from '../user/user.model'
import { ContentMetaService } from '../contentMeta/contentMeta.service'
import { uploadToS3 } from '../../utils/s3'
import { enrichFeedWithUserInfo } from './feed.utils'
import { FEED_STATUS, TFeedStatus } from './feed.constant'

const createFeedIntoDB = async (
  payload: TFeed,
  files: Express.Multer.File[],
) => {
  const { author: userId } = payload

  const user = await User.findById(userId)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This profile is not found !')
  }

  if (files?.length) {
    const uploadedUrls: string[] = []

    for (const file of files) {
      const mimeType = file.mimetype

      if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
        throw new AppError(
          httpStatus.UNPROCESSABLE_ENTITY,
          'Please upload a valid image or video file',
        )
      }

      const contentType = mimeType.split('/')[0] // 'image' or 'video'
      const randomId = Math.floor(100000 + Math.random() * 900000)
      const filePath = `${contentType}s/${randomId}`

      const url = (await uploadToS3({ file, fileName: filePath })) as string
      uploadedUrls.push(url)
    }

    payload.content = uploadedUrls
  }

  // create meta content
  const contentMeta = await ContentMetaService.createContentMetaIntoDB({})
  if (!contentMeta) {
    throw new AppError(httpStatus.CONFLICT, 'Feed post not created!')
  }

  // add contentMeta to payload
  payload.contentMeta = contentMeta?._id

  const feed = await Feed.create(payload)
  if (!feed) {
    throw new AppError(httpStatus.CONFLICT, 'Feed post not created!')
  }

  // update to assign content and modelType meta content
  await ContentMetaService.updateAContentMetaFromDB(contentMeta?._id, {
    // @ts-ignore
    content: feed?._id,
  })

  return feed
}

const getAllFeedsFromDB = async (
  query: Record<string, unknown>,
  userId: string,
) => {
  const feedQuery = new QueryBuilder(
    Feed.find({ isDeleted: false }).populate([
      { path: 'author', select: 'firstName lastName expertise photoUrl' },
      { path: 'contentMeta', select: 'like comment likeBy' },
    ]),
    query,
  )
    .search(['description'])
    .sort()
    .paginate()
    .fields()

  const result = await feedQuery.modelQuery
  const meta = await feedQuery.countTotal()

  const enrichedResult = await Promise.all(
    result.map((feed) => enrichFeedWithUserInfo(feed, userId)),
  )

  return {
    meta,
    result: enrichedResult,
  }
}

const getAFeedFromDB = async (id: string, userId: string) => {
  const result = await Feed.findById(id).populate([
    { path: 'author', select: 'firstName lastName expertise photoUrl' },
    { path: 'contentMeta', select: 'like comment likeBy' },
  ])

  if (!result || result.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found')
  }

  const enrichedFeed = await enrichFeedWithUserInfo(result, userId)

  return enrichedFeed
}

const updateFeedFromDB = async (
  id: string,
  payload: Partial<TFeed>,
  files: Express.Multer.File[],
) => {
  const feed = await Feed.findById(id)
  if (!feed || feed?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed posts not found')
  }

  if (files?.length) {
    const uploadedUrls: string[] = []

    for (const file of files) {
      const mimeType = file.mimetype

      if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
        throw new AppError(
          httpStatus.UNPROCESSABLE_ENTITY,
          'Please upload a valid image or video file',
        )
      }

      const contentType = mimeType.split('/')[0] // 'image' or 'video'
      const randomId = Math.floor(100000 + Math.random() * 900000)
      const filePath = `${contentType}s/${randomId}`

      const url = (await uploadToS3({ file, fileName: filePath })) as string
      uploadedUrls.push(url)
    }

    payload.content = uploadedUrls
  }

  const updateFeed = await Feed.findByIdAndUpdate(id, payload, {
    new: true,
  })
  if (!updateFeed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed posts not updated')
  }

  return updateFeed
}

const changeFeedStatus = async (
  id: string,
  payload: { status: TFeedStatus },
) => {
  const { status } = payload

  // Optional: validate status explicitly (extra safety)
  if (!Object.values(FEED_STATUS).includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid feed status')
  }

  const updatedFeed = await Feed.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
    },
    {
      $set: { status },
    },
    {
      new: true,
      runValidators: true,
    },
  )

  if (!updatedFeed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found or deleted')
  }

  return updatedFeed
}

const deleteAFeedFromDB = async (id: string) => {
  const feed = await Feed.findById(id)
  if (feed?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post already deleted!')
  }

  const result = await Feed.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
    },
    { new: true },
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed posts Delete failed')
  }

  return result
}

export const FeedService = {
  createFeedIntoDB,
  getAllFeedsFromDB,
  getAFeedFromDB,
  updateFeedFromDB,
  changeFeedStatus,
  deleteAFeedFromDB,
}
