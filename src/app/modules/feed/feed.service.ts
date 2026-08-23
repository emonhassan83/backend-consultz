import httpStatus from 'http-status'
import { Types } from 'mongoose'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TFeed } from './feed.interface'
import { Feed } from './feed.model'
import { User } from '../user/user.model'
import { ContentMetaService } from '../contentMeta/contentMeta.service'
import { uploadToS3 } from '../../utils/s3'
import {
  enrichFeedWithUserInfo,
  generateFeedFilePath,
  getReportedStatusBatch,
  notifyFollowersOnNewPost,
  sendContentModerationNotification,
  sendFeedNotificationToUser,
} from './feed.utils'
import {
  FEED_MODERATION_ACTION,
  FEED_STATUS,
  TFeedModerationAction,
  TFeedStatus,
} from './feed.constant'
import { TUser } from '../user/user.interface'
import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import { BlockProfile } from '../blockProfile/blockProfile.models'
import { Report } from '../report/report.models'

const createFeedIntoDB = async (
  payload: TFeed,
  userId: string,
  files: Express.Multer.File[],
) => {
  const user = await User.findById(userId);
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This profile is not found!');
  }

  // File upload
  if (files?.length) {
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const mimeType = file.mimetype;

      if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
        throw new AppError(
          httpStatus.UNPROCESSABLE_ENTITY,
          'Please upload a valid image or video file',
        );
      }

      const filePath = generateFeedFilePath(file);

      const url = (await uploadToS3({ file, fileName: filePath })) as string;
      uploadedUrls.push(url);
    }

    payload.content = uploadedUrls;
  }

  // Create ContentMeta
  const contentMeta = await ContentMetaService.createContentMetaIntoDB({});
  if (!contentMeta) {
    throw new AppError(httpStatus.CONFLICT, 'Feed post not created!');
  }

  // Assign to payload
  payload.contentMeta = contentMeta?._id;
  payload.author = user._id;

  // Create Feed
  const createdFeed = await Feed.create(payload);
  if (!createdFeed) {
    throw new AppError(httpStatus.CONFLICT, 'Feed post not created!');
  }
  
  // Update ContentMeta with feed reference
  await ContentMetaService.updateAContentMetaFromDB(contentMeta?._id, {
    content: createdFeed?._id as any,
  });
  
  const feed = await createdFeed.populate([
    { path: 'author', select: 'firstName lastName headline photoUrl' },
    { path: 'contentMeta', select: 'like comment likeBy' },
  ]);
  // Notify followers
  await notifyFollowersOnNewPost(feed._id.toString());

  // 🔥 IMPORTANT: Enrich the newly created feed with same logic as getAllFeedsFromDB
  const enrichedFeed = await enrichFeedWithUserInfo(feed, userId);

  // Add isReported (if you have this logic)
  const isReported = false;
  
  return {
    ...enrichedFeed,
    isReported,
  };
};

const getAllFeedsFromDB = async (
  query: Record<string, unknown>,
  currentUserId: string,
) => {
  // ── Current user check ────────────────────────────────────────────────────
  const currentUser = await User.findById(currentUserId).select('role');
  if (!currentUser) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // ── Base filter ───────────────────────────────────────────────────────────
  let feedFilter: any = { isDeleted: false };

  // ── Blocked users filter ──────────────────────────────────────────────────
  if (currentUser.role !== USER_ROLE.admin) {
    const blockedDocs = await BlockProfile.find({ blocker: currentUserId }).select('blocked');
    const blockedIds = blockedDocs.map((doc) => doc.blocked);
    if (blockedIds.length > 0) {
      feedFilter.author = { $nin: blockedIds };
    }
  }

  // ── Status filter ─────────────────────────────────────────────────────────
  if (query.status) {
    feedFilter.status = query.status;
    delete query.status;
  }

  // ── Search: description + author fields ───────────────────────────────────
  if (query.searchTerm && typeof query.searchTerm === 'string') {
    const term = query.searchTerm.trim();

    // Find authors whose name/expertise/skills match
    const matchingAuthors = await User.find({
      isDeleted: false,
      $or: [
        { firstName:  { $regex: term, $options: 'i' } },
        { lastName:   { $regex: term, $options: 'i' } },
        { expertise:  { $regex: term, $options: 'i' } },
        { skills:     { $regex: term, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const authorIds = matchingAuthors.map((u) => u._id);

    // Merge with any existing author filter (blocked users)
    const authorConditions: any[] = [
      { description: { $regex: term, $options: 'i' } },
    ];

    if (authorIds.length > 0) {
      // Respect blocked users — only include non-blocked matching authors
      const blockedNin = feedFilter.author?.$nin ?? [];
      const filteredAuthorIds = blockedNin.length > 0
        ? authorIds.filter(
            (id) => !blockedNin.some((b: any) => b.toString() === id.toString()),
          )
        : authorIds;

      if (filteredAuthorIds.length > 0) {
        authorConditions.push({ author: { $in: filteredAuthorIds } });
      }
    }

    feedFilter.$or = authorConditions;

    // Remove author.$nin from top-level since it's now handled inside $or
    delete feedFilter.author;

    delete query.searchTerm; // prevent QueryBuilder from double-searching
  }

  // ── Count active/restrict ─────────────────────────────────────────────────
  const [activeCount, restrictCount] = await Promise.all([
    Feed.countDocuments({ ...feedFilter, status: FEED_STATUS.active }),
    Feed.countDocuments({ ...feedFilter, status: FEED_STATUS.restrict }),
  ]);

  // ── Build query ───────────────────────────────────────────────────────────
  const feedQuery = new QueryBuilder(
    Feed.find(feedFilter).populate([
      { path: 'author', select: 'firstName lastName headline photoUrl expertise skills' },
      { path: 'contentMeta', select: 'like comment likeBy' },
    ]),
    query,
  )
    .filter()
    .sortByCustom({ createdAt: -1 })
    .paginate()
    .fields();

  const [feedList, meta] = await Promise.all([
    feedQuery.modelQuery,
    feedQuery.countTotal(),
  ]);

  // ── Batch isReported check ────────────────────────────────────────────────
  const feedIds = feedList.map((f: any) => f._id.toString());
  const foundReportedMap = feedIds.length > 0
    ? await getReportedStatusBatch(feedIds)
    : new Map();
  const reportedMap = feedIds.length > 0
    ? await getReportedStatusBatch(feedIds, currentUserId)
    : new Map();

  // ── Enrich feeds ──────────────────────────────────────────────────────────
  const enrichedFeedList = await Promise.all(
    feedList.map(async (feed: any) => {
      const enriched = await enrichFeedWithUserInfo(feed, currentUserId);
      return {
        ...enriched,
        isFoundReported: foundReportedMap.get(feed._id.toString()) || false,
        isReported: reportedMap.get(feed._id.toString()) || false,
      };
    }),
  );

  return {
    meta,
    data: {
      activeFeed: activeCount,
      restrictFeed: restrictCount,
      feedList: enrichedFeedList,
    },
  };
};

const getAFeedFromDB = async (id: string, userId: string) => {
  const feed = await Feed.findById(id).populate([
    { path: 'author', select: 'firstName lastName headline photoUrl' },
    { path: 'contentMeta', select: 'like comment likeBy' },
  ])

  if (!feed || feed.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found')
  }

  const enrichedFeed = await enrichFeedWithUserInfo(feed, userId)

  const deeplink = `consultz://feed/${id}`

  // Get all reports for this feed
  const [isFoundReported, isReported] = await Promise.all([
    Report.exists({ feed: id }),
    Report.exists({ feed: id, author: userId }),
  ])

  return {
    ...enrichedFeed,
    isFoundReported: Boolean(isFoundReported),
    isReported: Boolean(isReported),
    deeplink,
  }
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

      const filePath = generateFeedFilePath(file)

      const url = (await uploadToS3({ file, fileName: filePath })) as string
      uploadedUrls.push(url)
    }

    payload.content = uploadedUrls
  }

  const updateFeed = await Feed.findByIdAndUpdate(id, payload, {
    returnDocument: 'after',
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
    { returnDocument: 'after', runValidators: true },
  ).populate('author', 'firstName lastName email fcmToken pushNotify emailNotify status')

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

const moderateFeedFromDB = async (
  id: string,
  _adminId: string,
  payload: { moderationStatus: TFeedModerationAction; reason: string },
) => {
  const feed = await Feed.findOne({ _id: id, isDeleted: false }).populate(
    'author',
    'firstName lastName email fcmToken pushNotify emailNotify status',
  )

  if (!feed) {
    throw new AppError(httpStatus.NOT_FOUND, 'Feed post not found or deleted')
  }

  const author = feed.author as unknown as TUser

  switch (payload.moderationStatus) {
    case FEED_MODERATION_ACTION.restrict:
      feed.status = FEED_STATUS.restrict
      await sendContentModerationNotification(
        'restricted',
        author,
        feed,
        payload.reason,
      )
      break

    case FEED_MODERATION_ACTION.activate:
      feed.status = FEED_STATUS.active
      await sendContentModerationNotification(
        'reinstated',
        author,
        feed,
        payload.reason,
      )
      break

    case FEED_MODERATION_ACTION.remove:
      feed.status = FEED_STATUS.restrict
      feed.isDeleted = true
      await sendContentModerationNotification(
        'removed',
        author,
        feed,
        payload.reason,
      )
      break

    case FEED_MODERATION_ACTION.warn_user:
      await User.findByIdAndUpdate(author._id, {
        status: USER_STATUS.warning,
      })
      await sendContentModerationNotification(
        'warning',
        author,
        feed,
        payload.reason,
      )
      break

    case FEED_MODERATION_ACTION.suspend_user:
      await User.findByIdAndUpdate(author._id, {
        status: USER_STATUS.blocked,
      })
      feed.status = FEED_STATUS.restrict
      await sendContentModerationNotification(
        'suspended',
        author,
        feed,
        payload.reason,
      )
      break

    default:
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid moderation action')
  }

  feed.moderationStatus = payload.moderationStatus
  feed.reason = payload.reason

  await feed.save()

  return feed
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
    { returnDocument: 'after' },
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
  moderateFeedFromDB,
  deleteAFeedFromDB,
}
