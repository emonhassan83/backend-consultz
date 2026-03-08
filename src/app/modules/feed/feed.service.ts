import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TFeed } from './feed.interface'
import { Feed } from './feed.model'
import { User } from '../user/user.model'
import { ContentMetaService } from '../contentMeta/contentMeta.service'
import { uploadToS3 } from '../../utils/s3'
import {
  enrichFeedWithUserInfo,
  notifyFollowersOnNewPost,
  sendFeedNotificationToUser,
} from './feed.utils'
import { FEED_STATUS, TFeedStatus } from './feed.constant'
import { TUser } from '../user/user.interface'
import { USER_ROLE } from '../user/user.constant'
import { Follow } from '../connection/connection.models'
import { BlockProfile } from '../blockProfile/blockProfile.models'

const createFeedIntoDB = async (
  payload: TFeed,
  userId: string,
  files: Express.Multer.File[],
) => {
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
  payload.author = user._id

  const feed = await Feed.create(payload)
  if (!feed) {
    throw new AppError(httpStatus.CONFLICT, 'Feed post not created!')
  }

  // update to assign content and modelType meta content
  await ContentMetaService.updateAContentMetaFromDB(contentMeta?._id, {
    // @ts-ignore
    content: feed?._id,
  })

  // sent follow user to notify
  await notifyFollowersOnNewPost(feed._id.toString())

  return feed
}

const getAllFeedsFromDB = async (
  query: Record<string, unknown>,
  currentUserId: string,
) => {
  // 1. Get current user role to handle admin bypass
  const currentUser = await User.findById(currentUserId).select('role')
  if (!currentUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  // 2. Prepare base filter
  let feedFilter: any = {
    isDeleted: false,
  }

  // 3. Apply follow/block logic only for non-admin users
  if (currentUser.role !== USER_ROLE.admin) {
  const blockedDocs = await BlockProfile.find({
    blocker: currentUserId,
  }).select('blocked')

  const blockedIds = blockedDocs.map((doc) => doc.blocked)

  // শুধু blocked users বাদ, follow filter নেই
  if (blockedIds.length > 0) {
    feedFilter.author = { $nin: blockedIds }
  }
}

  // 4. Get counts for active and restricted feeds (for the filtered scope)
  const activeCount = await Feed.countDocuments({
    ...feedFilter,
    status: FEED_STATUS.active,
  })

  const restrictCount = await Feed.countDocuments({
    ...feedFilter,
    status: FEED_STATUS.restrict,
  })

  // 5. Build main query for paginated list
  const feedQuery = new QueryBuilder(
    Feed.find({
      ...feedFilter,
    }).populate([
      { path: 'author', select: 'firstName lastName headline photoUrl' },
      { path: 'contentMeta', select: 'like comment likeBy' },
    ]),
    query,
  )
    .search(['description'])
    .filter()
    .sortByCustom({
      createdAt: -1,
    })
    .paginate()
    .fields()

  const feedList = await feedQuery.modelQuery
  const meta = await feedQuery.countTotal()

  // 6. Enrich feeds with user-specific info (likes, etc.)
  const enrichedFeedList = await Promise.all(
    feedList.map((feed) => enrichFeedWithUserInfo(feed, currentUserId)),
  )

  // 7. Final response structure
  return {
    meta,
    data: {
      activeFeed: activeCount,
      restrictFeed: restrictCount,
      feedList: enrichedFeedList,
    },
  }
}

const getAFeedFromDB = async (id: string, userId: string) => {
  const result = await Feed.findById(id).populate([
    { path: 'author', select: 'firstName lastName headline photoUrl' },
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

  // 1. Validate status
  if (!Object.values(FEED_STATUS).includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid feed status')
  }

  // 2. Update feed
  const updatedFeed = await Feed.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { status } },
    { new: true, runValidators: true },
  )

  if (!updatedFeed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found or deleted')
  }

  // 3. Send notification to feed owner
  const author = updatedFeed.author as unknown as TUser

  if (author) {
    await sendFeedNotificationToUser(
      status === FEED_STATUS.active ? 'active' : 'restricted',
      author,
      updatedFeed,
    )
  }

  return updatedFeed
}

const deleteAFeedFromDB = async (id: string) => {
  const feed = await Feed.findById(id)
  if (!feed || feed?.isDeleted) {
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
